export const questionTypeValues = [
  "multiple-choice",
  "short-answer",
  "long-answer",
  "case-study"
] as const;

export type QuestionType = (typeof questionTypeValues)[number];
export type Difficulty = "easy" | "medium" | "hard";
export type AssignmentStatus = "queued" | "processing" | "completed" | "failed";

export interface QuestionPlanItem {
  type: QuestionType;
  count: number;
  marks: number;
}

export interface AssignmentInput {
  title: string;
  subject: string;
  grade: string;
  dueDate: Date;
  instructions?: string;
  sourceContent?: string;
  sourceFileName?: string;
  questionPlan: QuestionPlanItem[];
}

export interface GeneratedQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  answer?: string;
  difficulty: Difficulty;
  marks: number;
}

export interface QuestionSection {
  id: string;
  title: string;
  instruction: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedPaper {
  assignmentTitle: string;
  subject: string;
  grade: string;
  dueDate: string;
  totalMarks: number;
  sections: QuestionSection[];
  generatedAt: string;
}

export interface AssignmentEvent {
  assignmentId: string;
  status: AssignmentStatus | "pdf-ready";
  progress: number;
  message: string;
}
