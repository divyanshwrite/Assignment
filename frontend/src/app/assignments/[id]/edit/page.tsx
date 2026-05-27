"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, RefreshCw, Save, Sparkles } from "lucide-react";
import { fetchAssignment, patchQuestion, regenerateQuestion } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Assignment, AssignmentEvent, Difficulty, GeneratedQuestion } from "@/lib/types";

const FALLBACK_OPTIONS = [
  "A correct concept based on the lesson content",
  "A common misconception about the topic",
  "A partially correct but incomplete idea",
  "An unrelated statement"
];

function ensureFourPlain(options?: string[]): string[] {
  const cleaned = (options ?? [])
    .map((o) => (o ?? "").replace(/^\s*[A-Da-d][.)\-:]\s*/, "").trim())
    .filter(Boolean);
  return cleaned.length >= 4
    ? cleaned.slice(0, 4)
    : [...cleaned, ...FALLBACK_OPTIONS.slice(cleaned.length)].slice(0, 4);
}

interface DraftQuestion {
  id: string;
  type: GeneratedQuestion["type"];
  text: string;
  options: string[];
  answer: string;
  difficulty: Difficulty;
  marks: number;
  dirty: boolean;
  saving: boolean;
  regenerating: boolean;
  message: string;
}

function buildDraft(q: GeneratedQuestion): DraftQuestion {
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    options: q.type === "multiple-choice" ? ensureFourPlain(q.options) : [],
    answer: (q.answer || "A").toUpperCase(),
    difficulty: q.difficulty,
    marks: q.marks,
    dirty: false,
    saving: false,
    regenerating: false,
    message: ""
  };
}

export default function EditAssignmentPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftQuestion>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    try {
      const a = await fetchAssignment(id);
      setAssignment(a);
      const next: Record<string, DraftQuestion> = {};
      a.result?.sections.forEach((s) =>
        s.questions.forEach((q) => {
          next[q.id] = buildDraft(q);
        })
      );
      setDrafts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load assignment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    const socket = getSocket();
    socket.emit("assignment:watch", id);
    const handler = (event: AssignmentEvent) => {
      if (event.assignmentId !== id) return;
      if (event.status === "completed" || event.status === "pdf-ready") {
        void reload();
      }
    };
    socket.on("assignment:update", handler);
    return () => {
      socket.off("assignment:update", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function update(qid: string, partial: Partial<DraftQuestion>) {
    setDrafts((prev) => ({ ...prev, [qid]: { ...prev[qid], ...partial, dirty: true, message: "" } }));
  }

  async function save(qid: string) {
    const d = drafts[qid];
    if (!d) return;
    setDrafts((prev) => ({ ...prev, [qid]: { ...prev[qid], saving: true, message: "" } }));
    try {
      await patchQuestion(id, qid, {
        text: d.text,
        difficulty: d.difficulty,
        marks: d.marks,
        options: d.type === "multiple-choice" ? d.options : undefined,
        answer: d.type === "multiple-choice" ? d.answer : undefined
      });
      setDrafts((prev) => ({
        ...prev,
        [qid]: { ...prev[qid], saving: false, dirty: false, message: "Saved" }
      }));
    } catch (e) {
      setDrafts((prev) => ({
        ...prev,
        [qid]: {
          ...prev[qid],
          saving: false,
          message: e instanceof Error ? e.message : "Save failed"
        }
      }));
    }
  }

  async function regen(qid: string) {
    setDrafts((prev) => ({
      ...prev,
      [qid]: { ...prev[qid], regenerating: true, message: "Regenerating..." }
    }));
    try {
      await regenerateQuestion(id, qid);
      // The worker writes back to Mongo and emits a socket event; reload picks it up.
    } catch (e) {
      setDrafts((prev) => ({
        ...prev,
        [qid]: {
          ...prev[qid],
          regenerating: false,
          message: e instanceof Error ? e.message : "Regenerate failed"
        }
      }));
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Loading editor...
      </main>
    );
  }
  if (error || !assignment?.result) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <p className="font-bold">{error || "Generated paper is not ready yet."}</p>
        <Link href="/" className="text-orange-600 underline">Back to dashboard</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-[920px] mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-slate-700 font-bold hover:text-slate-900">
              <ArrowLeft size={16} />
              Back
            </Link>
            <div className="text-slate-500 text-sm">/</div>
            <div className="flex items-center gap-1.5 text-slate-700 font-bold">
              <Sparkles className="text-orange-500" size={15} />
              Edit questions
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <Link
              href={`/assignments/${id}/answer-key`}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-full font-bold hover:bg-slate-50"
            >
              Answer key
            </Link>
            <Link
              href={`/assignments/${id}/share`}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-full font-bold hover:bg-slate-50"
            >
              Share
            </Link>
          </div>
        </div>

        <header className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 shadow-sm">
          <h1 className="text-2xl font-extrabold">{assignment.title}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {assignment.subject} · {assignment.grade} · {assignment.result.totalMarks} marks
          </p>
          <p className="text-slate-500 text-[12px] mt-2">
            Edits save per-question. Regenerate replaces a single question via the AI worker.
          </p>
        </header>

        <div className="flex flex-col gap-5">
          {assignment.result.sections.map((section) => (
            <section key={section.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-end justify-between mb-3 border-b border-slate-100 pb-2">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                    Section {section.id}
                  </p>
                  <h2 className="font-extrabold">
                    {section.title.replace(/^Section [A-Z]:?\s*/i, "")}
                  </h2>
                  <p className="text-slate-500 text-xs italic">{section.instruction}</p>
                </div>
              </div>

              <ol className="flex flex-col gap-4 list-none p-0 m-0">
                {section.questions.map((q, idx) => {
                  const d = drafts[q.id];
                  if (!d) return null;
                  const disabled = d.saving || d.regenerating;
                  return (
                    <li
                      key={q.id}
                      className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 break-inside-avoid"
                    >
                      <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
                        <span className="text-[12px] font-extrabold text-slate-500">
                          Question {idx + 1} · {labelType(q.type)}
                        </span>
                        <div className="flex items-center gap-2 text-[12px]">
                          <select
                            value={d.difficulty}
                            disabled={disabled}
                            onChange={(e) =>
                              update(q.id, { difficulty: e.target.value as Difficulty })
                            }
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold"
                          >
                            <option value="easy">Easy</option>
                            <option value="medium">Moderate</option>
                            <option value="hard">Hard</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={d.marks}
                            disabled={disabled}
                            onChange={(e) => update(q.id, { marks: Number(e.target.value) || 1 })}
                            className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold"
                            aria-label="Marks"
                          />
                          <span className="text-slate-500">marks</span>
                        </div>
                      </div>

                      <textarea
                        value={d.text}
                        disabled={disabled}
                        rows={2}
                        onChange={(e) => update(q.id, { text: e.target.value })}
                        className="w-full bg-white mt-2 border border-slate-200 rounded-lg p-2.5 text-[14px] font-medium leading-snug"
                      />

                      {q.type === "multiple-choice" ? (
                        <div className="mt-3 grid gap-2">
                          {["A", "B", "C", "D"].map((letter, oi) => (
                            <div key={letter} className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-[12px] font-extrabold text-slate-500 w-16">
                                <input
                                  type="radio"
                                  name={`answer-${q.id}`}
                                  checked={d.answer === letter}
                                  disabled={disabled}
                                  onChange={() => update(q.id, { answer: letter })}
                                />
                                {letter}.
                              </label>
                              <input
                                value={d.options[oi] ?? ""}
                                disabled={disabled}
                                onChange={(e) => {
                                  const next = [...d.options];
                                  next[oi] = e.target.value;
                                  update(q.id, { options: next });
                                }}
                                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] font-medium"
                                placeholder={`Option ${letter}`}
                              />
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
                        <span className="text-[12px] text-slate-500">
                          {d.message || (d.dirty ? "Unsaved changes" : "")}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => regen(q.id)}
                            disabled={disabled}
                            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-bold rounded-full px-3 py-1.5 text-[12.5px]"
                          >
                            <RefreshCw size={13} className={d.regenerating ? "animate-spin" : ""} />
                            Regenerate
                          </button>
                          <button
                            onClick={() => save(q.id)}
                            disabled={disabled || !d.dirty}
                            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-full px-3 py-1.5 text-[12.5px]"
                          >
                            <Save size={13} />
                            {d.saving ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

function labelType(t: string) {
  return t.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
