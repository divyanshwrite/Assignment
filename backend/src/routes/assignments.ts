import { Router } from "express";
import crypto from "node:crypto";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { Assignment } from "../models/Assignment.js";
import { ShareToken } from "../models/ShareToken.js";
import { generationQueue, pdfQueue, pdfQueueEvents } from "../queues/assessmentQueues.js";
import { buildGenerationPrompt } from "../services/promptBuilder.js";
import { renderAnswerKeyPdf } from "../services/pdf.js";
import { getJobState, saveJobState } from "../services/jobState.js";
import { questionTypeValues, type AssignmentInput } from "../types/assessment.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const questionPlanSchema = z
  .array(
    z.object({
      type: z.enum(questionTypeValues),
      count: z.coerce.number().int().positive(),
      marks: z.coerce.number().int().positive()
    })
  )
  .min(1, "Select at least one question type.");

const createAssignmentSchema = z.object({
  title: z.string().trim().min(3, "Title is required."),
  subject: z.string().trim().min(2, "Subject is required."),
  grade: z.string().trim().min(1, "Grade is required."),
  dueDate: z
    .coerce.date({ invalid_type_error: "A valid due date is required." })
    .refine(
      (d) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(d);
        due.setHours(0, 0, 0, 0);
        return due.getTime() >= today.getTime();
      },
      { message: "Due date cannot be in the past." }
    ),
  instructions: z.string().trim().optional().default(""),
  questionPlan: z.preprocess(parseJsonField, questionPlanSchema)
});

router.post("/", upload.single("sourceFile"), async (req, res, next) => {
  try {
    const parsed = createAssignmentSchema.parse(req.body);
    const sourceFile = req.file;

    const input: AssignmentInput = {
      ...parsed,
      sourceFileName: sourceFile?.originalname || "",
      sourceContent: await extractSourceContent(sourceFile)
    };

    const prompt = buildGenerationPrompt(input);
    const assignment = await Assignment.create({
      ...input,
      prompt,
      status: "queued"
    });

    await saveJobState({
      assignmentId: assignment.id,
      status: "queued",
      progress: 5,
      message: "Assignment queued for AI generation."
    });

    await generationQueue.add(
      "generate",
      { assignmentId: assignment.id },
      { jobId: `generate-${assignment.id}-${Date.now()}` }
    );

    res.status(201).json({ assignmentId: assignment.id, status: assignment.status });
  } catch (error) {
    next(error);
  }
});


router.get("/", async (req, res, next) => {
  try {
    const assignments = await Assignment.find().sort({ createdAt: -1 }).select("-pdf").lean();
    res.json(assignments);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id).lean();
    if (!assignment) {
      res.status(404).json({ message: "Assignment not found." });
      return;
    }
    res.json(assignment);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) {
      res.status(404).json({ message: "Assignment not found." });
      return;
    }
    res.json({ message: "Assignment deleted successfully.", assignmentId: req.params.id });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/state", async (req, res, next) => {
  try {
    const state = await getJobState(req.params.id);
    if (!state) {
      res.status(404).json({ message: "No job state found." });
      return;
    }
    res.json(state);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/regenerate", async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      res.status(404).json({ message: "Assignment not found." });
      return;
    }

    assignment.status = "queued";
    assignment.error = undefined;
    assignment.pdf = undefined;
    await assignment.save();

    await saveJobState({
      assignmentId: assignment.id,
      status: "queued",
      progress: 5,
      message: "Regeneration queued."
    });

    await generationQueue.add(
      "regenerate",
      { assignmentId: assignment.id },
      { jobId: `regenerate-${assignment.id}-${Date.now()}` }
    );

    res.json({ assignmentId: assignment.id, status: assignment.status });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment?.result) {
      res.status(404).json({ message: "Generated paper is not ready yet." });
      return;
    }

    if (!assignment.pdf?.data) {
      const job = await pdfQueue.add(
        "render-pdf",
        { assignmentId: assignment.id },
        { jobId: `pdf-${assignment.id}-${Date.now()}` }
      );
      await job.waitUntilFinished(pdfQueueEvents, 15000);
    }

    const refreshed = await Assignment.findById(req.params.id);
    if (!refreshed?.pdf?.data) {
      res.status(202).json({ message: "PDF is being prepared. Try again in a moment." });
      return;
    }

    res.setHeader("Content-Type", refreshed.pdf.contentType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName(refreshed.title)}-question-paper.pdf"`
    );
    res.send(refreshed.pdf.data);
  } catch (error) {
    next(error);
  }
});

// ─── Single question edit ─────────────────────────────────────────────────────
const editQuestionSchema = z
  .object({
    text: z.string().trim().min(3).optional(),
    options: z.array(z.string()).optional(),
    answer: z.string().trim().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    marks: z.coerce.number().int().positive().optional()
  })
  .strict();

router.patch("/:id/questions/:qid", async (req, res, next) => {
  try {
    const patch = editQuestionSchema.parse(req.body);
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment?.result) {
      res.status(404).json({ message: "Assignment or paper not found." });
      return;
    }

    const { found, question } = findQuestion(assignment.result, req.params.qid);
    if (!found) {
      res.status(404).json({ message: "Question not found." });
      return;
    }

    if (patch.text !== undefined) {
      question.text = patch.text;
    }
    if (patch.difficulty !== undefined) {
      question.difficulty = patch.difficulty;
    }
    if (patch.marks !== undefined) {
      question.marks = patch.marks;
    }

    if (question.type === "multiple-choice") {
      if (patch.options) {
        const cleaned = patch.options
          .map((opt) => (opt ?? "").trim())
          .filter(Boolean)
          .slice(0, 4);
        const letters = ["A", "B", "C", "D"];
        const padded = cleaned.length >= 4
          ? cleaned
          : [
              ...cleaned,
              ...["Option B", "Option C", "Option D"].slice(0, 4 - cleaned.length)
            ].slice(0, 4);
        question.options = padded.map((opt, idx) => {
          const stripped = opt.replace(/^\s*[A-Da-d][\.\)\:\-]\s*/, "").trim();
          return `${letters[idx]}. ${stripped || `Option ${letters[idx]}`}`;
        });
      }
      if (patch.answer !== undefined) {
        const a = patch.answer.trim().toUpperCase();
        question.answer = /^[A-D]$/.test(a) ? a : "A";
      }
    }

    // Recompute totalMarks if marks changed.
    assignment.result.totalMarks = assignment.result.sections.reduce(
      (sum, sec) => sum + sec.questions.reduce((inner, q) => inner + Number(q.marks || 0), 0),
      0
    );

    // Invalidate cached PDF; it'll be regenerated lazily on next download.
    assignment.pdf = undefined;
    assignment.markModified("result");
    await assignment.save();

    res.json({ assignmentId: assignment.id, question });
  } catch (error) {
    next(error);
  }
});

// ─── Regenerate a single question via the worker ──────────────────────────────
router.post("/:id/questions/:qid/regenerate", async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment?.result) {
      res.status(404).json({ message: "Assignment or paper not found." });
      return;
    }

    const { found } = findQuestion(assignment.result, req.params.qid);
    if (!found) {
      res.status(404).json({ message: "Question not found." });
      return;
    }

    await saveJobState({
      assignmentId: assignment.id,
      status: "processing",
      progress: 50,
      message: `Regenerating question ${req.params.qid}.`
    });

    await generationQueue.add(
      "regenerate-question",
      { assignmentId: assignment.id, questionId: req.params.qid },
      { jobId: `regen-q-${assignment.id}-${req.params.qid}-${Date.now()}` }
    );

    res.json({ assignmentId: assignment.id, questionId: req.params.qid, queued: true });
  } catch (error) {
    next(error);
  }
});

// ─── Answer key PDF ───────────────────────────────────────────────────────────
router.get("/:id/answer-key.pdf", async (req, res, next) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment?.result) {
      res.status(404).json({ message: "Generated paper is not ready yet." });
      return;
    }
    const buffer = await renderAnswerKeyPdf(assignment.result);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName(assignment.title)}-answer-key.pdf"`
    );
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// ─── Share links (public read-only) ───────────────────────────────────────────
const createShareSchema = z.object({
  ttlHours: z.coerce.number().int().positive().max(24 * 30).default(24 * 7)
});

router.post("/:id/share", async (req, res, next) => {
  try {
    const { ttlHours } = createShareSchema.parse(req.body ?? {});
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      res.status(404).json({ message: "Assignment not found." });
      return;
    }
    const token = crypto.randomBytes(18).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await ShareToken.create({ token, assignment: assignment._id, expiresAt });
    res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/shares", async (req, res, next) => {
  try {
    const list = await ShareToken.find({ assignment: req.params.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(
      list.map((s) => ({
        token: s.token,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString()
      }))
    );
  } catch (error) {
    next(error);
  }
});

function findQuestion(paper: { sections: { id: string; questions: { id: string }[] }[] }, qid: string) {
  for (const section of paper.sections) {
    for (const question of section.questions) {
      if (question.id === qid) {
        return { found: true as const, question: question as any };
      }
    }
  }
  return { found: false as const, question: null as any };
}

function parseJsonField(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function extractSourceContent(file?: Express.Multer.File) {
  if (!file) {
    return "";
  }

  const isPdf =
    file.mimetype === "application/pdf" ||
    file.originalname.toLowerCase().endsWith(".pdf");

  if (isPdf) {
    try {
      const parser = new PDFParse({ data: file.buffer });
      const result = await parser.getText();
      await parser.destroy();
      const text = result.text.replace(/\s+/g, " ").trim();
      if (text) {
        return text.slice(0, 12000);
      }
    } catch (error) {
      console.warn(`Could not extract PDF text from ${file.originalname}:`, error);
    }

    return `Uploaded PDF file: ${file.originalname}. Generate syllabus-relevant questions for the requested subject and grade.`;
  }

  const isText =
    file.mimetype.startsWith("text/") ||
    file.originalname.toLowerCase().endsWith(".txt") ||
    file.originalname.toLowerCase().endsWith(".md");

  if (!isText) {
    return `Uploaded file: ${file.originalname}. Use it as teacher-provided source material when available.`;
  }

  return file.buffer.toString("utf8").slice(0, 12000);
}

function safeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "assessment";
}

export default router;
