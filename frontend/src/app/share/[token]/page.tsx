"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarDays, FileText } from "lucide-react";
import { fetchSharedAssignment } from "@/lib/api";
import type { Assignment } from "@/lib/types";

const FALLBACK_OPTIONS = [
  "A correct concept based on the lesson content",
  "A common misconception about the topic",
  "A partially correct but incomplete idea",
  "An unrelated statement"
];

function ensureFourOptions(options?: string[]): string[] {
  const letters = ["A", "B", "C", "D"];
  const cleaned = (options ?? [])
    .map((o) => (o ?? "").trim())
    .filter(Boolean);
  const padded = cleaned.length >= 4
    ? cleaned.slice(0, 4)
    : [...cleaned, ...FALLBACK_OPTIONS.slice(cleaned.length)].slice(0, 4);
  return padded.map((opt, idx) => {
    const stripped = opt.replace(/^\s*[A-Da-d][.)\-:]\s*/, "").trim();
    return `${letters[idx]}. ${stripped || `Option ${letters[idx]}`}`;
  });
}

function labelDifficulty(value: string) {
  if (value === "medium") return "Moderate";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface SharedAssignment extends Assignment {
  expiresAt?: string;
}

export default function SharedAssignmentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [assignment, setAssignment] = useState<SharedAssignment | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSharedAssignment(token)
      .then((a) => {
        if (active) setAssignment(a as SharedAssignment);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Could not load assignment.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Loading assignment...
      </main>
    );
  }
  if (error || !assignment?.result) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md text-center">
          <h1 className="text-xl font-extrabold text-rose-600">Link unavailable</h1>
          <p className="text-slate-600 mt-2 text-sm">{error || "This share link has expired or no longer exists."}</p>
        </div>
      </main>
    );
  }

  const paper = assignment.result;

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 print:p-0 print:bg-white">
      <div className="max-w-[860px] mx-auto">
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-10 print:shadow-none print:border-0">
          <header className="text-center border-b-2 border-slate-800 pb-4 mb-6">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.18em] uppercase text-orange-600">
              <FileText size={14} />
              Question Paper
            </p>
            <h1 className="text-2xl md:text-3xl font-extrabold mt-1">{paper.assignmentTitle}</h1>
            <p className="text-slate-500 text-sm mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1">
              <span>{paper.subject}</span>
              <span>·</span>
              <span>{paper.grade}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={14} /> Due {paper.dueDate}
              </span>
              <span>·</span>
              <span className="text-rose-600 font-extrabold">{paper.totalMarks} marks</span>
            </p>
          </header>

          <section className="border-b border-slate-200 pb-5 mb-5">
            <h2 className="font-extrabold mb-2">Student Information</h2>
            <div className="grid md:grid-cols-3 gap-3 text-[13px]">
              <Line label="Name" />
              <Line label="Roll Number" />
              <Line label="Section" />
            </div>
          </section>

          <div className="flex flex-col gap-7">
            {paper.sections.map((section) => (
              <section key={section.id}>
                <div className="flex items-end justify-between border-b border-slate-200 pb-1 mb-3">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                      Section {section.id}
                    </p>
                    <h2 className="text-base font-extrabold">{section.title.replace(/^Section [A-Z]:?\s*/i, "")}</h2>
                    <p className="text-[12px] italic text-slate-500">{section.instruction}</p>
                  </div>
                  <span className="text-rose-600 font-extrabold text-sm">
                    {section.questions.reduce((sum, q) => sum + q.marks, 0)} marks
                  </span>
                </div>

                <ol className="flex flex-col gap-4 list-none p-0 m-0">
                  {section.questions.map((q, idx) => (
                    <li key={q.id || idx} className="break-inside-avoid">
                      <div className="flex justify-between gap-3">
                        <p className="text-[14px] font-semibold text-slate-800">
                          <span className="mr-1.5 font-extrabold text-slate-500">{idx + 1}.</span>
                          {q.text}
                        </p>
                        <span className="text-slate-500 font-extrabold whitespace-nowrap text-sm">
                          [{q.marks} Mark{q.marks > 1 ? "s" : ""}]
                        </span>
                      </div>

                      {q.type === "multiple-choice" ? (
                        <ol className="flex flex-col gap-1.5 mt-2 list-none p-0 pl-6">
                          {ensureFourOptions(q.options).map((opt, oi) => (
                            <li
                              key={`${q.id}-${oi}`}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700"
                            >
                              {opt}
                            </li>
                          ))}
                        </ol>
                      ) : null}

                      <div className="mt-2 pl-6 flex gap-2 no-print">
                        <span className={
                          "inline-block text-[10px] font-extrabold tracking-wider uppercase rounded-full px-2 py-0.5 border " +
                          (q.difficulty === "easy"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : q.difficulty === "medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-rose-50 text-rose-700 border-rose-200")
                        }>
                          {labelDifficulty(q.difficulty)}
                        </span>
                        <span className="inline-block text-[10px] font-extrabold tracking-wider uppercase rounded-full px-2 py-0.5 border bg-slate-100 text-slate-500 border-slate-200">
                          {q.type.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>

          {assignment.expiresAt ? (
            <p className="mt-8 text-center text-[11px] text-slate-400 font-bold uppercase tracking-widest no-print">
              Shared link · expires {new Date(assignment.expiresAt).toLocaleString()}
            </p>
          ) : null}
        </article>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </main>
  );
}

function Line({ label }: { label: string }) {
  return (
    <div className="flex items-end gap-2">
      <span className="font-bold text-slate-700 text-[13px]">{label}</span>
      <span className="flex-1 border-b border-slate-400 h-[18px]" />
    </div>
  );
}
