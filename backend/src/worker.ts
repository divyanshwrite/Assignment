import { Worker, type Job } from "bullmq";
import { connectMongo, disconnectMongo } from "./db/mongo.js";
import { createQueueConnection } from "./db/redis.js";
import { Assignment } from "./models/Assignment.js";
import { generationQueueName, pdfQueue, pdfQueueName } from "./queues/assessmentQueues.js";
import { generatePaper, regenerateSingleQuestion } from "./services/generator.js";
import { saveJobState } from "./services/jobState.js";
import { renderQuestionPaperPdf } from "./services/pdf.js";
import { buildGenerationPrompt } from "./services/promptBuilder.js";
import type { AssignmentInput } from "./types/assessment.js";

await connectMongo();

// ─── Generation worker ────────────────────────────────────────────────────────
const generationWorker = new Worker(
  generationQueueName,
  async (job) => {
    if (job.name === "regenerate-question") {
      return handleRegenerateQuestion(job.data.assignmentId, job.data.questionId);
    }
    return handleFullGeneration(job);
  },
  { connection: createQueueConnection() as any, concurrency: 2 }
);

async function handleFullGeneration(job: Job) {
  const assignment = await Assignment.findById(job.data.assignmentId);
  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  await job.updateProgress(20);
  assignment.status = "processing";
  assignment.error = undefined;
  await assignment.save();
  await saveJobState({
    assignmentId: assignment.id,
    status: "processing",
    progress: 20,
    message: "Building a structured AI prompt."
  });

  const input: AssignmentInput = {
    title: assignment.title,
    subject: assignment.subject,
    grade: assignment.grade,
    dueDate: assignment.dueDate,
    instructions: assignment.instructions,
    sourceContent: assignment.sourceContent,
    sourceFileName: assignment.sourceFileName,
    questionPlan: assignment.questionPlan
  };

  const prompt = buildGenerationPrompt(input);
  assignment.prompt = prompt;
  await assignment.save();

  await job.updateProgress(55);
  await saveJobState({
    assignmentId: assignment.id,
    status: "processing",
    progress: 55,
    message: "Generating and validating the question paper."
  });

  const paper = await generatePaper(input, prompt);

  // Defense in depth: every MCQ MUST have four labeled options and a valid answer.
  enforceMcqIntegrity(paper);

  console.log(
    `[worker] Generated paper ${assignment.id} with`,
    paper.sections.flatMap((s) =>
      s.questions
        .filter((q) => q.type === "multiple-choice")
        .map((q) => `${q.id}:${q.options?.length ?? 0} opts`)
    ).join(", ") || "(no MCQs)"
  );

  assignment.result = paper;
  assignment.status = "completed";
  assignment.pdf = undefined;
  await assignment.save();

  await job.updateProgress(100);
  await saveJobState({
    assignmentId: assignment.id,
    status: "completed",
    progress: 100,
    message: "Question paper is ready."
  });

  // Pre-render the PDF so the first download is instant.
  await pdfQueue.add(
    "render-pdf",
    { assignmentId: assignment.id },
    { jobId: `pdf-${assignment.id}-${Date.now()}` }
  );

  return { assignmentId: assignment.id };
}

async function handleRegenerateQuestion(assignmentId: string, questionId: string) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment?.result) {
    throw new Error("Assignment or paper not found.");
  }

  let foundQuestion: any = null;
  for (const section of assignment.result.sections) {
    for (const q of section.questions) {
      if (q.id === questionId) {
        foundQuestion = q;
        break;
      }
    }
    if (foundQuestion) break;
  }
  if (!foundQuestion) {
    throw new Error("Question not found.");
  }

  await saveJobState({
    assignmentId: assignment.id,
    status: "processing",
    progress: 60,
    message: `Regenerating question ${questionId}.`
  });

  const replacement = await regenerateSingleQuestion({
    subject: assignment.subject,
    grade: assignment.grade,
    topic: assignment.title,
    type: foundQuestion.type,
    difficulty: foundQuestion.difficulty,
    marks: foundQuestion.marks,
    avoidText: foundQuestion.text
  });

  // Mutate in place; preserve id and type so references stay stable.
  foundQuestion.text = replacement.text;
  foundQuestion.difficulty = replacement.difficulty;
  foundQuestion.marks = replacement.marks;
  if (foundQuestion.type === "multiple-choice") {
    foundQuestion.options = replacement.options;
    foundQuestion.answer = replacement.answer;
  }

  // Recalculate totalMarks since marks may have shifted.
  assignment.result.totalMarks = assignment.result.sections.reduce(
    (sum, sec) => sum + sec.questions.reduce((inner, q) => inner + Number(q.marks || 0), 0),
    0
  );

  // Invalidate cached PDF so next download regenerates.
  assignment.pdf = undefined;
  assignment.markModified("result");
  await assignment.save();

  await saveJobState({
    assignmentId: assignment.id,
    status: "completed",
    progress: 100,
    message: `Question ${questionId} regenerated.`
  });

  return { assignmentId: assignment.id, questionId };
}

function enforceMcqIntegrity(paper: { sections: { questions: any[] }[] }) {
  for (const section of paper.sections) {
    for (const question of section.questions) {
      if (question.type !== "multiple-choice") {
        continue;
      }
      const letters = ["A", "B", "C", "D"];
      const fallback = [
        "A correct concept based on the lesson content",
        "A common misconception about the topic",
        "A partially correct but incomplete idea",
        "An unrelated statement"
      ];
      const existing = (question.options ?? [])
        .map((opt: string) => (opt ?? "").trim())
        .filter(Boolean);
      const merged = existing.length >= 4
        ? existing.slice(0, 4)
        : [...existing, ...fallback.slice(existing.length)].slice(0, 4);
      question.options = merged.map((opt: string, idx: number) => {
        const stripped = opt.replace(/^\s*[A-Da-d][\.\)\:\-]\s*/, "").trim();
        return `${letters[idx]}. ${stripped || `Option ${letters[idx]}`}`;
      });
      if (!question.answer || !/^[A-D]$/i.test(question.answer.trim())) {
        question.answer = "A";
      } else {
        question.answer = question.answer.trim().toUpperCase();
      }
    }
  }
}

// ─── PDF worker ───────────────────────────────────────────────────────────────
const pdfWorker = new Worker(
  pdfQueueName,
  async (job) => {
    const assignment = await Assignment.findById(job.data.assignmentId);
    if (!assignment?.result) {
      throw new Error("Generated paper is not available.");
    }

    const buffer = await renderQuestionPaperPdf(assignment.result);
    assignment.pdf = {
      data: buffer,
      contentType: "application/pdf",
      generatedAt: new Date()
    };
    await assignment.save();

    await saveJobState({
      assignmentId: assignment.id,
      status: "pdf-ready",
      progress: 100,
      message: "PDF export is ready."
    });

    return { assignmentId: assignment.id };
  },
  { connection: createQueueConnection() as any, concurrency: 1 }
);

generationWorker.on("failed", async (job, error) => {
  const assignmentId = String(job?.data.assignmentId || "");
  if (!assignmentId) {
    return;
  }
  // For single-question regen failures we don't want to mark the whole assignment failed.
  if (job?.name === "regenerate-question") {
    await saveJobState({
      assignmentId,
      status: "completed",
      progress: 100,
      message: `Question regeneration failed: ${error.message}`
    });
    return;
  }
  await Assignment.findByIdAndUpdate(assignmentId, {
    status: "failed",
    error: error.message
  });
  await saveJobState({
    assignmentId,
    status: "failed",
    progress: 100,
    message: error.message
  });
});

console.log("VedaAI workers are running.");

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down workers...`);
  await Promise.all([generationWorker.close(), pdfWorker.close()]);
  await disconnectMongo();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
