import type { AssignmentInput, GeneratedPaper } from "../types/assessment.js";

const outputSchema: Record<keyof GeneratedPaper, unknown> = {
  assignmentTitle: "string",
  subject: "string",
  grade: "string",
  dueDate: "ISO date string",
  totalMarks: "number",
  generatedAt: "ISO datetime string",
  sections: [
    {
      id: "A",
      title: "Section A",
      instruction: "Attempt all questions.",
      questions: [
        {
          id: "A1",
          type: "multiple-choice | short-answer | long-answer | case-study",
          text: "question text only",
          options: ["A. option text", "B. option text", "C. option text", "D. option text"],
          answer: "A",
          difficulty: "easy | medium | hard",
          marks: "number"
        }
      ]
    }
  ]
};

export function buildGenerationPrompt(input: AssignmentInput) {
  const promptPayload = {
    task: "Create a classroom-ready assessment question paper.",
    rules: [
      "Return JSON only.",
      "No markdown, prose, or code fences.",
      "One section per question type.",
      "Every question needs id, type, text, difficulty, marks.",
      "MCQs: exactly four options as 'A. ...','B. ...','C. ...','D. ...' plus answer letter.",
      "Non-MCQ: omit options and answer.",
      "Mix easy/medium/hard.",
      "Honor the requested counts and marks."
    ],
    assignment: {
      title: input.title,
      subject: input.subject,
      grade: input.grade,
      dueDate: input.dueDate.toISOString().slice(0, 10),
      instructions: input.instructions || "",
      sourceContext: input.sourceContent ? input.sourceContent.slice(0, 4000) : "",
      questionPlan: input.questionPlan
    },
    outputSchema
  };

  return JSON.stringify(promptPayload);
}
