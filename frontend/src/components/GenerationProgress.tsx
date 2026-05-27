"use client";

import { CircleAlert, Loader2, Sparkles } from "lucide-react";
import type { AssignmentEvent } from "@/lib/types";

interface GenerationProgressProps {
  event: AssignmentEvent | null;
  status?: string;
}

export function GenerationProgress({ event, status }: GenerationProgressProps) {
  const isFailed = event?.status === "failed" || status === "failed";
  const progress = event?.progress ?? (status === "completed" ? 100 : 12);
  const message = event?.message ?? (status === "completed" ? "Question paper is ready." : "Waiting for updates.");
  const Icon = isFailed ? CircleAlert : progress >= 100 ? Sparkles : Loader2;

  return (
    <section className="progress-panel" data-failed={isFailed}>
      <div className="progress-heading">
        <span className="progress-icon">
          <Icon aria-hidden="true" className={progress < 100 && !isFailed ? "spin" : ""} size={18} />
        </span>
        <div>
          <h2>{isFailed ? "Generation failed" : "AI generation"}</h2>
          <p>{message}</p>
        </div>
      </div>
      <div aria-label="Generation progress" className="progress-track" role="progressbar">
        <span style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
      </div>
    </section>
  );
}
