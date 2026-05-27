import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { z } from "zod";
import { env } from "../config/env.js";
import type {
  AssignmentInput,
  Difficulty,
  GeneratedPaper,
  QuestionPlanItem,
  QuestionType
} from "../types/assessment.js";

const generatedQuestionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["multiple-choice", "short-answer", "long-answer", "case-study"]),
  text: z.string().min(8),
  options: z.array(z.string().min(1)).optional(),
  answer: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  marks: z.coerce.number().positive()
});

const generatedPaperSchema = z.object({
  assignmentTitle: z.string().min(1),
  subject: z.string().min(1),
  grade: z.string().min(1),
  dueDate: z.string().min(1),
  totalMarks: z.coerce.number().nonnegative(),
  generatedAt: z.string().min(1),
  sections: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        instruction: z.string().min(1),
        questions: z.array(generatedQuestionSchema).min(1)
      })
    )
    .min(1)
});

const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      baseURL: env.OPENAI_BASE_URL,
      defaultHeaders: {
        ...(env.APP_PUBLIC_URL ? { "HTTP-Referer": env.APP_PUBLIC_URL } : {}),
        "X-Title": env.APP_NAME
      }
    })
  : null;

export async function generatePaper(input: AssignmentInput, prompt: string): Promise<GeneratedPaper> {
  if (openai) {
    try {
      const supportsJsonMode =
        !/openrouter\/free/i.test(env.OPENAI_MODEL) && !/:free$/i.test(env.OPENAI_MODEL);

      // Cap output relative to the requested workload so models do not over-think.
      const totalQuestions = input.questionPlan.reduce((sum, p) => sum + p.count, 0);
      const maxTokens = Math.min(4000, Math.max(900, totalQuestions * 220));

      const request: ChatCompletionCreateParamsNonStreaming & { reasoning?: { enabled: boolean } } = {
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert assessment designer. Output ONLY a JSON object matching the user schema. " +
              "No prose, markdown, or code fences. Multiple-choice questions MUST have an 'options' array of " +
              "exactly four entries prefixed 'A. ','B. ','C. ','D. ' and an 'answer' letter."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: maxTokens,
        // OpenRouter extension: disables 'thinking' for hybrid reasoning models (GLM, Qwen3 etc.)
        reasoning: { enabled: false }
      };

      const response = await openai.chat.completions.create(
        supportsJsonMode
          ? { ...request, response_format: { type: "json_object" as const } }
          : request,
        { timeout: 60_000 }
      );

      if (!Array.isArray(response.choices)) {
        throw new Error(`AI provider returned an invalid response: ${JSON.stringify(response).slice(0, 500)}`);
      }

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error("The model returned an empty response.");
      }

      return normalizePaper(generatedPaperSchema.parse(extractJson(content)), input);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "AI generation failed.");
    }
  }

  return buildLocalPaper(input);
}

function extractJson(value: string) {
  const cleaned = stripCodeFence(value).trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("The model did not return parseable JSON.");
  }
}

function stripCodeFence(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
}

function normalizePaper(paper: GeneratedPaper, input: AssignmentInput): GeneratedPaper {
  const sections = paper.sections.map((section, sectionIndex) => {
    const letter = sectionLetter(sectionIndex);
    return {
      ...section,
      id: letter,
      title: section.title || `Section ${letter}`,
      questions: section.questions.map((question, questionIndex) => ({
        ...question,
        id: `${letter}${questionIndex + 1}`,
        options: normalizeOptions(question),
        answer: normalizeAnswer(question),
        marks: Number(question.marks)
      }))
    };
  });

  return {
    ...paper,
    assignmentTitle: paper.assignmentTitle || input.title,
    subject: paper.subject || input.subject,
    grade: paper.grade || input.grade,
    dueDate: input.dueDate.toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    totalMarks: sections.reduce(
      (sum, section) => sum + section.questions.reduce((inner, question) => inner + question.marks, 0),
      0
    ),
    sections
  };
}

function buildLocalPaper(input: AssignmentInput): GeneratedPaper {
  const sections = input.questionPlan.map((plan, index) => {
    const letter = sectionLetter(index);
    const label = labelForType(plan.type);

    return {
      id: letter,
      title: `Section ${letter}: ${label}`,
      instruction: instructionForType(plan.type),
      questions: Array.from({ length: plan.count }, (_, questionIndex) => ({
        id: `${letter}${questionIndex + 1}`,
        type: plan.type,
        text: questionTextFor(plan, questionIndex, input),
        options: plan.type === "multiple-choice" ? optionsFor(questionIndex, input) : undefined,
        answer: plan.type === "multiple-choice" ? "A" : undefined,
        difficulty: difficultyFor(questionIndex, plan.count),
        marks: plan.marks
      }))
    };
  });

  return {
    assignmentTitle: input.title,
    subject: input.subject,
    grade: input.grade,
    dueDate: input.dueDate.toISOString().slice(0, 10),
    totalMarks: sections.reduce(
      (sum, section) => sum + section.questions.reduce((inner, question) => inner + question.marks, 0),
      0
    ),
    generatedAt: new Date().toISOString(),
    sections
  };
}

function normalizeOptions(question: z.infer<typeof generatedQuestionSchema>) {
  if (question.type !== "multiple-choice") {
    return undefined;
  }

  const letters = ["A", "B", "C", "D"];
  const cleaned = (question.options ?? [])
    .map((option) => option.trim())
    .filter(Boolean);

  const padded = cleaned.length >= 4
    ? cleaned.slice(0, 4)
    : [...cleaned, ...fallbackOptions(cleaned.length)].slice(0, 4);

  return padded.map((option, index) => {
    const letter = letters[index];
    const stripped = option.replace(/^\s*[A-Da-d][\.\)\:\-]\s*/, "").trim();
    return `${letter}. ${stripped || `Option ${letter}`}`;
  });
}

function fallbackOptions(startIndex: number) {
  const placeholders = [
    "A correct concept based on the lesson content",
    "A common misconception about the topic",
    "A partially correct but incomplete idea",
    "An unrelated statement"
  ];
  return placeholders.slice(startIndex);
}

// ─── Single-question regeneration ─────────────────────────────────────────────
const singleQuestionSchema = z.object({
  text: z.string().min(8),
  options: z.array(z.string().min(1)).optional(),
  answer: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  marks: z.coerce.number().positive()
});

interface RegenerateQuestionInput {
  subject: string;
  grade: string;
  topic?: string;
  type: QuestionType;
  difficulty: Difficulty;
  marks: number;
  avoidText?: string;
}

export async function regenerateSingleQuestion(input: RegenerateQuestionInput) {
  const prompt = JSON.stringify({
    task: "Regenerate ONE assessment question. Return JSON only.",
    rules: [
      "Output a single JSON object — no array, no markdown.",
      "Schema: {text, difficulty, marks, options?, answer?}",
      "MCQ: include 4 options 'A. ..','B. ..','C. ..','D. ..' and answer letter.",
      "Non-MCQ: omit options and answer.",
      "Be different from the previous question if provided."
    ],
    subject: input.subject,
    grade: input.grade,
    topic: input.topic ?? "",
    type: input.type,
    difficulty: input.difficulty,
    marks: input.marks,
    previous: input.avoidText ?? ""
  });

  if (openai) {
    try {
      const supportsJsonMode =
        !/openrouter\/free/i.test(env.OPENAI_MODEL) && !/:free$/i.test(env.OPENAI_MODEL);

      const request: ChatCompletionCreateParamsNonStreaming & { reasoning?: { enabled: boolean } } = {
        model: env.OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an expert assessment designer. Output ONLY a JSON object for ONE question. " +
              "MCQs must have four options A./B./C./D. and an answer letter."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.55,
        max_tokens: 600,
        reasoning: { enabled: false }
      };

      const response = await openai.chat.completions.create(
        supportsJsonMode
          ? { ...request, response_format: { type: "json_object" as const } }
          : request,
        { timeout: 45_000 }
      );

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error("Empty response.");
      }

      const parsed = singleQuestionSchema.parse(extractJson(content));
      const synthetic = {
        id: "x",
        type: input.type,
        text: parsed.text,
        options: parsed.options,
        answer: parsed.answer,
        difficulty: parsed.difficulty,
        marks: Number(parsed.marks)
      };
      return {
        text: synthetic.text,
        difficulty: synthetic.difficulty,
        marks: synthetic.marks,
        options: input.type === "multiple-choice" ? normalizeOptions(synthetic as any) : undefined,
        answer: input.type === "multiple-choice" ? normalizeAnswer(synthetic as any) : undefined
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Single-question regeneration failed.");
    }
  }

  // Local fallback — deterministic but always valid.
  const local = {
    id: "x",
    type: input.type,
    text: `Re-prompt: discuss a ${input.difficulty} concept in ${input.topic || input.subject}.`,
    options: input.type === "multiple-choice" ? undefined : undefined,
    difficulty: input.difficulty,
    marks: input.marks
  };
  return {
    text: local.text,
    difficulty: input.difficulty,
    marks: input.marks,
    options: input.type === "multiple-choice" ? normalizeOptions({ ...local, type: "multiple-choice" } as any) : undefined,
    answer: input.type === "multiple-choice" ? "A" : undefined
  };
}

function normalizeAnswer(question: z.infer<typeof generatedQuestionSchema>) {
  if (question.type !== "multiple-choice") {
    return undefined;
  }
  return question.answer?.trim() || "A";
}

function sectionLetter(index: number) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function labelForType(type: QuestionType) {
  const labels: Record<QuestionType, string> = {
    "multiple-choice": "Multiple Choice",
    "short-answer": "Short Answer",
    "long-answer": "Long Answer",
    "case-study": "Case Study"
  };
  return labels[type];
}

function instructionForType(type: QuestionType) {
  const instructions: Record<QuestionType, string> = {
    "multiple-choice": "Choose the most appropriate answer for each question.",
    "short-answer": "Answer each question in two to four sentences.",
    "long-answer": "Write well-structured answers with relevant examples.",
    "case-study": "Read the scenario carefully and answer with clear reasoning."
  };
  return instructions[type];
}

function difficultyFor(index: number, total: number): Difficulty {
  if (total <= 2) {
    return index === 0 ? "easy" : "medium";
  }

  const ratio = index / Math.max(total - 1, 1);
  if (ratio < 0.4) {
    return "easy";
  }
  if (ratio < 0.75) {
    return "medium";
  }
  return "hard";
}

function topicFor(input: AssignmentInput) {
  const content = input.sourceContent?.replace(/\s+/g, " ").trim();
  if (!content) {
    return input.subject;
  }

  const excerpt = content.slice(0, 180);
  return `${input.subject} based on the uploaded material: "${excerpt}${content.length > 180 ? "..." : ""}"`;
}

function questionTextFor(plan: QuestionPlanItem, index: number, input: AssignmentInput) {
  const number = index + 1;
  const topic = topicFor(input);
  const teacherNote = input.instructions ? ` Consider: ${input.instructions}` : "";

  const templates: Record<QuestionType, string[]> = {
    "multiple-choice": [
      `Which statement best explains a key concept in ${topic}?`,
      `Identify the most accurate example related to ${topic}.`,
      `Which option correctly connects cause and effect in ${topic}?`
    ],
    "short-answer": [
      `Explain one important idea from ${topic} in your own words.${teacherNote}`,
      `State two reasons why ${topic} is important for this chapter.${teacherNote}`,
      `Describe a real-world example that connects with ${topic}.${teacherNote}`
    ],
    "long-answer": [
      `Analyze the main concepts of ${topic} and support your answer with examples.${teacherNote}`,
      `Compare two important ideas from ${topic} and explain their significance.${teacherNote}`,
      `Write a detailed response showing how ${topic} can be applied in a practical situation.${teacherNote}`
    ],
    "case-study": [
      `A student observes a situation related to ${topic}. Identify the problem, explain the concept involved, and propose a solution.${teacherNote}`,
      `Read the scenario: a classroom discussion raises conflicting views about ${topic}. Evaluate both views and justify your answer.${teacherNote}`,
      `Use the given context from ${topic} to make a decision and explain the evidence behind it.${teacherNote}`
    ]
  };

  return templates[plan.type][(number - 1) % templates[plan.type].length];
}

function optionsFor(index: number, input: AssignmentInput) {
  const topic = input.subject || "the topic";
  const sets = [
    [
      `A. A correct concept related to ${topic}`,
      `B. An unrelated definition`,
      `C. A partially correct but incomplete idea`,
      `D. A common misconception`
    ],
    [
      `A. The best explanation for the given situation`,
      `B. A statement that reverses cause and effect`,
      `C. A statement with missing context`,
      `D. A statement unrelated to ${topic}`
    ]
  ];
  return sets[index % sets.length];
}
