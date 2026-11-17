import type { AppError, DocumentStats, MarkdownDocument } from "../../types";
import { describeSaveState } from "./saveState";
import { goalProgress } from "../editor/documentStats";

type StatusBarProps = {
  document: MarkdownDocument;
  stats: DocumentStats;
  error: AppError | null;
  /** Target word count; 0 hides the goal. */
  wordGoal: number;
  onDismissError: () => void;
};

const numberFormat = new Intl.NumberFormat();

export function StatusBar({
  document,
  stats,
  error,
  wordGoal,
  onDismissError,
}: StatusBarProps) {
  const state = describeSaveState(document, error);
  const progress = goalProgress(stats.words, wordGoal);

  return (
    <div className="status-bar" role="status">
      <span
        className={`status-bar__state status-bar__state--${state.tone}`}
        title={error?.details}
      >
        {state.label}
      </span>

      {error && (
        <button
          type="button"
          className="status-bar__dismiss"
          onClick={onDismissError}
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}

      <span className="status-bar__spacer" />

      <span className="status-bar__metric">
        Ln {numberFormat.format(stats.line)}, Col{" "}
        {numberFormat.format(stats.column)}
      </span>
      {progress ? (
        <span
          className={`status-bar__metric status-bar__goal${
            progress.reached ? " status-bar__goal--reached" : ""
          }`}
        >
          <progress
            value={progress.ratio}
            max={1}
            aria-label={`Word goal: ${Math.round(progress.ratio * 100)}%`}
          />
          {numberFormat.format(stats.words)} / {numberFormat.format(wordGoal)}{" "}
          words
        </span>
      ) : (
        <span className="status-bar__metric">
          {numberFormat.format(stats.words)}{" "}
          {stats.words === 1 ? "word" : "words"}
        </span>
      )}
      <span className="status-bar__metric">
        {numberFormat.format(stats.characters)} chars
      </span>

      <span
        className="status-bar__file"
        title={document.filePath ?? "Not saved to disk yet"}
      >
        {document.fileName}
        {document.isDirty && <span aria-label="Unsaved changes"> •</span>}
      </span>
    </div>
  );
}
