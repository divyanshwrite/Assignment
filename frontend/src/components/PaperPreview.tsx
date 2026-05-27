import { CalendarDays, FileText } from "lucide-react";
import { DifficultyBadge } from "@/components/DifficultyBadge";
import type { GeneratedPaper } from "@/lib/types";

interface PaperPreviewProps {
  paper: GeneratedPaper;
}

export function PaperPreview({ paper }: PaperPreviewProps) {
  return (
    <article className="paper-preview">
      <header className="paper-header">
        <div className="paper-kicker">
          <FileText aria-hidden="true" size={17} />
          Generated Question Paper
        </div>
        <h1>{paper.assignmentTitle}</h1>
        <div className="paper-meta">
          <span>{paper.subject}</span>
          <span>{paper.grade}</span>
          <span>
            <CalendarDays aria-hidden="true" size={15} />
            Due {formatDate(paper.dueDate)}
          </span>
          <strong>{paper.totalMarks} marks</strong>
        </div>
      </header>

      <section className="student-info">
        <h2>Student Information</h2>
        <div className="info-lines">
          <Line label="Name" />
          <Line label="Roll Number" />
          <Line label="Section" />
        </div>
      </section>

      <div className="paper-sections">
        {paper.sections.map((section) => (
          <section className="question-section" key={section.id}>
            <div className="question-section-heading">
              <div>
                <p>Section {section.id}</p>
                <h2>{section.title.replace(/^Section [A-Z]:?\s*/i, "")}</h2>
              </div>
              <span>{section.questions.reduce((sum, question) => sum + question.marks, 0)} marks</span>
            </div>
            <p className="section-instruction">{section.instruction}</p>

            <ol className="question-list">
              {section.questions.map((question) => (
                <li className="question-item" key={question.id}>
                  <div className="question-copy">
                    <p>{question.text}</p>
                    {question.type === "multiple-choice" ? (
                      <ol className="question-options">
                        {ensureFourOptions(question.options).map((option, index) => (
                          <li key={`${question.id}-option-${index}`}>{option}</li>
                        ))}
                      </ol>
                    ) : null}
                    <div className="question-tags">
                      <DifficultyBadge value={question.difficulty} />
                      <span>{labelType(question.type)}</span>
                    </div>
                  </div>
                  <strong className="marks-pill">
                    {question.marks} mark{question.marks > 1 ? "s" : ""}
                  </strong>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </article>
  );
}

function Line({ label }: { label: string }) {
  return (
    <div className="info-line">
      <span>{label}</span>
      <i aria-hidden="true" />
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

function labelType(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const FALLBACK_OPTION_TEXT = [
  "A correct concept based on the lesson content",
  "A common misconception about the topic",
  "A partially correct but incomplete idea",
  "An unrelated statement"
];

function ensureFourOptions(options?: string[]): string[] {
  const letters = ["A", "B", "C", "D"];
  const cleaned = (options ?? [])
    .map((option) => option.trim())
    .filter(Boolean);

  const padded = cleaned.length >= 4
    ? cleaned.slice(0, 4)
    : [...cleaned, ...FALLBACK_OPTION_TEXT.slice(cleaned.length)].slice(0, 4);

  return padded.map((option, index) => {
    const stripped = option.replace(/^\s*[A-Da-d][.)\-:]\s*/, "").trim();
    return `${letters[index]}. ${stripped || `Option ${letters[index]}`}`;
  });
}
