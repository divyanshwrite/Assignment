import { Schema, model, type Document } from "mongoose";
import type {
  AssignmentInput,
  AssignmentStatus,
  GeneratedPaper,
  QuestionPlanItem
} from "../types/assessment.js";

export interface AssignmentDocument extends Document, AssignmentInput {
  status: AssignmentStatus;
  prompt?: string;
  result?: GeneratedPaper;
  error?: string;
  pdf?: {
    data: Buffer;
    contentType: string;
    generatedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const questionPlanSchema = new Schema<QuestionPlanItem>(
  {
    type: { type: String, required: true },
    count: { type: Number, required: true, min: 1 },
    marks: { type: Number, required: true, min: 1 }
  },
  { _id: false }
);

const questionSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    text: { type: String, required: true },
    options: { type: [String], default: undefined },
    answer: { type: String },
    difficulty: { type: String, required: true },
    marks: { type: Number, required: true }
  },
  { _id: false }
);

const sectionSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    instruction: { type: String, required: true },
    questions: { type: [questionSchema], required: true }
  },
  { _id: false }
);

const generatedPaperSchema = new Schema(
  {
    assignmentTitle: { type: String, required: true },
    subject: { type: String, required: true },
    grade: { type: String, required: true },
    dueDate: { type: String, required: true },
    totalMarks: { type: Number, required: true },
    sections: { type: [sectionSchema], required: true },
    generatedAt: { type: String, required: true }
  },
  { _id: false }
);

const assignmentSchema = new Schema<AssignmentDocument>(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    grade: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    instructions: { type: String, default: "" },
    sourceContent: { type: String, default: "" },
    sourceFileName: { type: String, default: "" },
    questionPlan: { type: [questionPlanSchema], required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true
    },
    prompt: { type: String },
    result: { type: generatedPaperSchema },
    error: { type: String },
    pdf: {
      data: Buffer,
      contentType: String,
      generatedAt: Date
    }
  },
  { timestamps: true }
);

export const Assignment = model<AssignmentDocument>("Assignment", assignmentSchema);
