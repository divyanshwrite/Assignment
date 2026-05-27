"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Download, Home, RefreshCw } from "lucide-react";
import { GenerationProgress } from "@/components/GenerationProgress";
import { PaperPreview } from "@/components/PaperPreview";
import { pdfUrl } from "@/lib/api";
import { useAssessmentStore } from "@/store/assessmentStore";

export function AssignmentOutput() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const assignment = useAssessmentStore((state) => state.assignment);
  const event = useAssessmentStore((state) => state.event);
  const loading = useAssessmentStore((state) => state.loading);
  const submitting = useAssessmentStore((state) => state.submitting);
  const error = useAssessmentStore((state) => state.error);
  const load = useAssessmentStore((state) => state.load);
  const watch = useAssessmentStore((state) => state.watch);
  const regenerate = useAssessmentStore((state) => state.regenerate);

  useEffect(() => {
    void load(id);
    const cleanup = watch(id);
    return cleanup;
  }, [id, load, watch]);

  const result = assignment?.result;
  const shouldShowProgress = !result || assignment.status !== "completed" || event?.status === "processing";

  return (
    <main className="output-shell">
      <div className="output-toolbar">
        <Link className="icon-button" href="/" title="Create another assignment">
          <Home aria-hidden="true" size={18} />
        </Link>
        <div>
          <p>Assessment Output</p>
          <h1>{assignment?.title || "Question paper"}</h1>
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary-button"
            disabled={!assignment || submitting}
            onClick={() => assignment && void regenerate(assignment._id)}
            type="button"
          >
            <RefreshCw aria-hidden="true" size={17} />
            Regenerate
          </button>
          <a
            aria-disabled={!result}
            className="primary-button"
            href={result ? pdfUrl(id) : "#"}
            onClick={(eventClick) => {
              if (!result) {
                eventClick.preventDefault();
              }
            }}
          >
            <Download aria-hidden="true" size={17} />
            PDF
          </a>
        </div>
      </div>

      {error ? <p className="submit-error">{error}</p> : null}
      {loading && !assignment ? <GenerationProgress event={event} status="queued" /> : null}
      {shouldShowProgress ? <GenerationProgress event={event} status={assignment?.status} /> : null}
      {result ? <PaperPreview paper={result} /> : null}
    </main>
  );
}
