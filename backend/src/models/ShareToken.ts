import { Schema, model, type Document, type Types } from "mongoose";

export interface ShareTokenDocument extends Document {
  token: string;
  assignment: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shareTokenSchema = new Schema<ShareTokenDocument>(
  {
    token: { type: String, required: true, unique: true, index: true },
    assignment: { type: Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    // Mongo TTL index: documents are removed automatically once expiresAt passes.
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  { timestamps: true }
);

export const ShareToken = model<ShareTokenDocument>("ShareToken", shareTokenSchema);
