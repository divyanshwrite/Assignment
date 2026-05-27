"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, Printer } from "lucide-react";
import { answerKeyPdfUrl, fetchAssignment } from "@/lib/api";
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

export default function AnswerKeyPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAssignment(id)
      .then((a) => {
        if (active) setAssignment(a);
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
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Loading answer key...
      </main>
    );
  }

  if (error || !assignment?.result) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-700 p-6 text-center">
        <p className="font-bold">{error || "Answer key is not ready yet."}</p>
        <Link href="/" className="text-orange-600 underline">Back to dashboard</Link>
      </main>
    );
  }

  const paper = assignment.result;

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8 print:p-0 print:bg-white">
      <div className="max-w-[860px] mx-auto">
        {/* Toolbar (hidden in print) */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5 no-print">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-700 font-bold hover:text-slate-900"
          >
            <ArrowLeft size={16} />
            Back to dashboard
          </Link>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-full px-4 py-2 text-sm"
            >
              <Printer size={15} /> Print
            </button>
            <a
              href={answerKeyPdfUrl(id)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-full px-4 py-2 text-sm"
            >
              <Download size={15} /> PDF
            </a>
          </div>
        </div>

        {/* Paper */}
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-10 print:shadow-none print:border-0 print:rounded-none">
          <header className="text-center border-b-2 border-slate-800 pb-4 mb-6">
            <p className="text-[11px] font-extrabold tracking-[0.18em] text-emerald-700 uppercase">
              Answer Key
            </p>
            <h1 className="text-2xl md:text-3xl font-extrabold mt-1">{paper.assignmentTitle}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {paper.subject} · {paper.grade} · {paper.totalMarks} marks
            </p>
          </header>

          <div className="flex flex-col gap-8">
            {paper.sections.map((section) => (
              <section key={section.id}>
                <div className="flex items-end justify-between border-b border-slate-200 pb-1 mb-3">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700">
                      Section {section.id}
                    </p>
                    <h2 className="text-base font-extrabold">{section.title.replace(/^Section [A-Z]:?\s*/i, "")}</h2>
                  </div>
                  <span className="text-rose-600 font-extrabold text-sm">
                    {section.questions.reduce((sum, q) => sum + q.marks, 0)} marks
                  </span>
                </div>

                <ol className="flex flex-col gap-4 list-none p-0 m-0">
                  {section.questions.map((q, idx) => {
                    const isMcq = q.type === "multiple-choice";
                    const correct = (q.answer || "A").toUpperCase();
                    const options = isMcq ? ensureFourOptions(q.options) : [];
                    return (
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

                        {isMcq ? (
                          <ol className="flex flex-col gap-1.5 mt-2 list-none p-0 pl-6">
                            {options.map((opt) => {
                              const letter = opt.match(/^\s*([A-D])/)?.[1] ?? "";
                              const isCorrect = letter === correct;
                              return (
                                <li
                                  key={opt}
                                  className={
                                    isCorrect
                                      ? "rounded-lg px-3 py-1.5 text-[13px] font-extrabold border bg-emerald-50 border-emerald-200 text-emerald-800 flex items-center gap-2"
                                      : "rounded-lg px-3 py-1.5 text-[13px] font-medium border bg-slate-50 border-slate-200 text-slate-700"
                                  }
                                >
                                  {isCorrect ? <CheckCircle2 size={14} className="text-emerald-700" /> : null}
                                  {opt}
                                </li>
                              );
                            })}
                          </ol>
                        ) : null}

                        <div className="mt-2 pl-6">
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
                          {isMcq ? (
                            <span className="ml-2 text-[12.5px] font-extrabold text-emerald-700">
                              Correct answer: {correct}
                            </span>
                          ) : (
                            <span className="ml-2 text-[12.5px] italic text-slate-500">
                              {q.answer ? `Model answer: ${q.answer}` : "Open-ended response — grade per rubric."}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
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
