import type { AppError, DocumentStats, MarkdownDocument } from "../../types";
import { describeSaveState } from "./saveState";

type StatusBarProps = {
  document: MarkdownDocument;
  stats: DocumentStats;
  error: AppError | null;
  onDismissError: () => void;
};

const numberFormat = new Intl.NumberFormat();

export function StatusBar({
  document,
  stats,
  error,
  onDismissError,
}: StatusBarProps) {
  const state = describeSaveState(document, error);

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
      <span className="status-bar__metric">
        {numberFormat.format(stats.words)}{" "}
        {stats.words === 1 ? "word" : "words"}
      </span>
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
