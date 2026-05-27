"use client";

import { BookOpenCheck, CheckSquare, FileQuestion, MessageSquareText } from "lucide-react";
import type { QuestionType } from "@/lib/types";

export interface PlanRow {
  type: QuestionType;
  label: string;
  description: string;
  enabled: boolean;
  count: number;
  marks: number;
}

interface QuestionPlanBuilderProps {
  rows: PlanRow[];
  errors: Record<string, string>;
  onToggle: (type: QuestionType) => void;
  onNumberChange: (type: QuestionType, field: "count" | "marks", value: number) => void;
}

const icons = {
  "multiple-choice": CheckSquare,
  "short-answer": MessageSquareText,
  "long-answer": BookOpenCheck,
  "case-study": FileQuestion
};

export function QuestionPlanBuilder({
  rows,
  errors,
  onToggle,
  onNumberChange
}: QuestionPlanBuilderProps) {
  return (
    <fieldset className="question-plan">
      <legend>Question Types</legend>
      <div className="plan-grid">
        {rows.map((row) => {
          const Icon = icons[row.type];

          return (
            <div className="plan-row" data-enabled={row.enabled} key={row.type}>
              <label className="plan-toggle">
                <input checked={row.enabled} onChange={() => onToggle(row.type)} type="checkbox" />
                <span className="plan-icon">
                  <Icon aria-hidden="true" size={18} />
                </span>
                <span>
                  <strong>{row.label}</strong>
                  <small>{row.description}</small>
                </span>
              </label>

              <div className="plan-numbers">
                <label>
                  <span>Questions</span>
                  <input
                    disabled={!row.enabled}
                    min={1}
                    onChange={(event) => onNumberChange(row.type, "count", Number(event.target.value))}
                    type="number"
                    value={row.count}
                  />
                </label>
                <label>
                  <span>Marks each</span>
                  <input
                    disabled={!row.enabled}
                    min={1}
                    onChange={(event) => onNumberChange(row.type, "marks", Number(event.target.value))}
                    type="number"
                    value={row.marks}
                  />
                </label>
              </div>

              {errors[row.type] ? <p className="field-error">{errors[row.type]}</p> : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
