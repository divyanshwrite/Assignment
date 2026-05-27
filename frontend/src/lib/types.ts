export type QuestionType = "multiple-choice" | "short-answer" | "long-answer" | "case-study";
export type Difficulty = "easy" | "medium" | "hard";
export type AssignmentStatus = "queued" | "processing" | "completed" | "failed";

export interface QuestionPlanItem {
  type: QuestionType;
  count: number;
  marks: number;
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

export interface Assignment {
  _id: string;
  title: string;
  subject: string;
  grade: string;
  dueDate: string;
  instructions?: string;
  sourceFileName?: string;
  questionPlan: QuestionPlanItem[];
  status: AssignmentStatus;
  result?: GeneratedPaper;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentEvent {
  assignmentId: string;
  status: AssignmentStatus | "pdf-ready";
  progress: number;
  message: string;
}

export interface AssignmentFormValues {
  title: string;
  subject: string;
  grade: string;
  dueDate: string;
  instructions: string;
  sourceFile: File | null;
  questionPlan: QuestionPlanItem[];
}
