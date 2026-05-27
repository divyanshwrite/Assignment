import type { Assignment, AssignmentFormValues } from "./types";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.message || "Request failed.";
    throw new Error(message);
  }

  return payload as T;
}

export async function createAssignment(values: AssignmentFormValues) {
  const body = new FormData();
  body.append("title", values.title);
  body.append("subject", values.subject);
  body.append("grade", values.grade);
  body.append("dueDate", values.dueDate);
  body.append("instructions", values.instructions);
  body.append("questionPlan", JSON.stringify(values.questionPlan));
  if (values.sourceFile) {
    body.append("sourceFile", values.sourceFile);
  }

  const response = await fetch(`${API_URL}/api/assignments`, {
    method: "POST",
    body
  });

  return parseResponse<{ assignmentId: string; status: string }>(response);
}

export async function fetchAssignment(id: string) {
  const response = await fetch(`${API_URL}/api/assignments/${id}`, { cache: "no-store" });
  return parseResponse<Assignment>(response);
}

export async function regenerateAssignment(id: string) {
  const response = await fetch(`${API_URL}/api/assignments/${id}/regenerate`, {
    method: "POST"
  });
  return parseResponse<{ assignmentId: string; status: string }>(response);
}

export function pdfUrl(id: string) {
  return `${API_URL}/api/assignments/${id}/pdf`;
}

export function answerKeyPdfUrl(id: string) {
  return `${API_URL}/api/assignments/${id}/answer-key.pdf`;
}

export async function patchQuestion(
  assignmentId: string,
  questionId: string,
  patch: Partial<{
    text: string;
    options: string[];
    answer: string;
    difficulty: "easy" | "medium" | "hard";
    marks: number;
  }>
) {
  const response = await fetch(
    `${API_URL}/api/assignments/${assignmentId}/questions/${questionId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }
  );
  return parseResponse<{ assignmentId: string; question: unknown }>(response);
}

export async function regenerateQuestion(assignmentId: string, questionId: string) {
  const response = await fetch(
    `${API_URL}/api/assignments/${assignmentId}/questions/${questionId}/regenerate`,
    { method: "POST" }
  );
  return parseResponse<{ assignmentId: string; questionId: string; queued: boolean }>(response);
}

export async function createShareLink(assignmentId: string, ttlHours = 24 * 7) {
  const response = await fetch(`${API_URL}/api/assignments/${assignmentId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ttlHours })
  });
  return parseResponse<{ token: string; expiresAt: string }>(response);
}

export async function listShareLinks(assignmentId: string) {
  const response = await fetch(`${API_URL}/api/assignments/${assignmentId}/shares`, {
    cache: "no-store"
  });
  return parseResponse<Array<{ token: string; expiresAt: string; createdAt: string }>>(response);
}

export async function fetchSharedAssignment(token: string) {
  const response = await fetch(`${API_URL}/api/share/${token}`, { cache: "no-store" });
  return parseResponse<Assignment & { sharedAt: string; expiresAt: string }>(response);
}
