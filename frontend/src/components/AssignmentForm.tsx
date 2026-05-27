"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FileUp, SendHorizonal, WandSparkles } from "lucide-react";
import { QuestionPlanBuilder, type PlanRow } from "@/components/QuestionPlanBuilder";
import type { AssignmentFormValues, QuestionType } from "@/lib/types";
import { useAssessmentStore } from "@/store/assessmentStore";

const initialRows: PlanRow[] = [
  {
    type: "multiple-choice",
    label: "Multiple choice",
    description: "Fast recall and concept checks",
    enabled: true,
    count: 5,
    marks: 1
  },
  {
    type: "short-answer",
    label: "Short answer",
    description: "Brief reasoning and definitions",
    enabled: true,
    count: 4,
    marks: 2
  },
  {
    type: "long-answer",
    label: "Long answer",
    description: "Explanations with examples",
    enabled: true,
    count: 2,
    marks: 5
  },
  {
    type: "case-study",
    label: "Case study",
    description: "Scenario-based application",
    enabled: false,
    count: 1,
    marks: 8
  }
];

type FormErrors = Partial<Record<keyof AssignmentFormValues | QuestionType | "plan", string>>;

export function AssignmentForm() {
  const router = useRouter();
  const create = useAssessmentStore((state) => state.create);
  const submitting = useAssessmentStore((state) => state.submitting);
  const apiError = useAssessmentStore((state) => state.error);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PlanRow[]>(initialRows);
  const [errors, setErrors] = useState<FormErrors>({});

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => {
        if (!row.enabled) {
          return sum;
        }
        return {
          questions: sum.questions + row.count,
          marks: sum.marks + row.count * row.marks
        };
      },
      { questions: 0, marks: 0 }
    );
  }, [rows]);

  function toggleRow(type: QuestionType) {
    setRows((current) =>
      current.map((row) => (row.type === type ? { ...row, enabled: !row.enabled } : row))
    );
  }

  function updateNumber(type: QuestionType, field: "count" | "marks", value: number) {
    setRows((current) =>
      current.map((row) => (row.type === type ? { ...row, [field]: Number.isFinite(value) ? value : 0 } : row))
    );
  }

  function validate() {
    const nextErrors: FormErrors = {};
    if (!title.trim()) {
      nextErrors.title = "Assignment title is required.";
    }
    if (!subject.trim()) {
      nextErrors.subject = "Subject is required.";
    }
    if (!grade.trim()) {
      nextErrors.grade = "Class or grade is required.";
    }
    if (!dueDate) {
      nextErrors.dueDate = "Due date is required.";
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(dueDate);
      selected.setHours(0, 0, 0, 0);
      if (selected.getTime() < today.getTime()) {
        nextErrors.dueDate = "Due date cannot be in the past.";
      }
    }

    const activeRows = rows.filter((row) => row.enabled);
    if (activeRows.length === 0) {
      nextErrors.plan = "Select at least one question type.";
    }

    activeRows.forEach((row) => {
      if (!Number.isInteger(row.count) || row.count <= 0 || !Number.isInteger(row.marks) || row.marks <= 0) {
        nextErrors[row.type] = "Use whole numbers greater than zero.";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    const values: AssignmentFormValues = {
      title: title.trim(),
      subject: subject.trim(),
      grade: grade.trim(),
      dueDate,
      instructions: instructions.trim(),
      sourceFile,
      questionPlan: rows
        .filter((row) => row.enabled)
        .map((row) => ({
          type: row.type,
          count: row.count,
          marks: row.marks
        }))
    };

    const assignmentId = await create(values);
    router.push(`/assignments/${assignmentId}`);
  }

  return (
    <form className="creator-form" onSubmit={handleSubmit}>
      <section className="form-section">
        <div className="section-title">
          <WandSparkles aria-hidden="true" size={18} />
          <div>
            <h2>Create Assignment</h2>
            <p>Define the paper shape before AI generation starts.</p>
          </div>
        </div>

        <div className="field-grid two-columns">
          <label className="field">
            <span>Assignment title</span>
            <input
              aria-invalid={Boolean(errors.title)}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Unit 3 Assessment"
              value={title}
            />
            {errors.title ? <small className="field-error">{errors.title}</small> : null}
          </label>

          <label className="field">
            <span>Subject</span>
            <input
              aria-invalid={Boolean(errors.subject)}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Science"
              value={subject}
            />
            {errors.subject ? <small className="field-error">{errors.subject}</small> : null}
          </label>

          <label className="field">
            <span>Class / grade</span>
            <input
              aria-invalid={Boolean(errors.grade)}
              onChange={(event) => setGrade(event.target.value)}
              placeholder="Grade 8"
              value={grade}
            />
            {errors.grade ? <small className="field-error">{errors.grade}</small> : null}
          </label>

          <label className="field">
            <span>Due date</span>
            <span className="input-with-icon">
              <CalendarDays aria-hidden="true" size={17} />
              <input
                aria-invalid={Boolean(errors.dueDate)}
                onChange={(event) => setDueDate(event.target.value)}
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={dueDate}
              />
            </span>
            {errors.dueDate ? <small className="field-error">{errors.dueDate}</small> : null}
          </label>
        </div>
      </section>

      <section className="form-section">
        <QuestionPlanBuilder
          errors={errors}
          onNumberChange={updateNumber}
          onToggle={toggleRow}
          rows={rows}
        />
        {errors.plan ? <p className="field-error">{errors.plan}</p> : null}
      </section>

      <section className="form-section">
        <div className="field-grid">
          <label className="field upload-field">
            <span>Source material</span>
            <div className="upload-box">
              <FileUp aria-hidden="true" size={19} />
              <div>
                <strong>{sourceFile?.name || "Upload PDF or text"}</strong>
                <small>Optional context for question generation</small>
              </div>
              <input
                accept=".pdf,.txt,.md,text/plain,application/pdf"
                onChange={(event) => setSourceFile(event.target.files?.[0] || null)}
                type="file"
              />
            </div>
          </label>

          <label className="field">
            <span>Additional instructions</span>
            <textarea
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Focus on application-based questions, include diagrams where relevant..."
              rows={5}
              value={instructions}
            />
          </label>
        </div>
      </section>

      <section className="form-footer">
        <div className="paper-total">
          <span>{totals.questions} questions</span>
          <strong>{totals.marks} marks</strong>
        </div>
        <button className="primary-button" disabled={submitting} type="submit">
          <SendHorizonal aria-hidden="true" size={18} />
          {submitting ? "Creating..." : "Generate paper"}
        </button>
      </section>

      {apiError ? <p className="submit-error">{apiError}</p> : null}
    </form>
  );
}
