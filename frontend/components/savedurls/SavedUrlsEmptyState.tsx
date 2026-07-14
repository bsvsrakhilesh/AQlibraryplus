import React from "react";
import { BookmarkPlus, RotateCcw } from "lucide-react";

type Props = {
  libraryTotalCount: number;
  isReviewQueueActive: boolean;
  onAddUrl: () => void;
  onResetView: () => void;
};

const SavedUrlsEmptyState: React.FC<Props> = ({
  libraryTotalCount,
  isReviewQueueActive,
  onAddUrl,
  onResetView,
}) => {
  let title = "No rows on this page match the current filters.";
  let body =
    "Try clearing filters, switching queues, or choosing a different collection.";

  if (libraryTotalCount === 0) {
    title = "No saved URLs yet.";
    body = "Add a source to start building your review and capture library.";
  } else if (isReviewQueueActive) {
    title = "No URLs in this scope have changed since your review stamp.";
    body =
      "Change filters, switch queues, or mark this page as reviewed again after new changes land.";
  }

  return (
    <div className="saved-urls-empty-state">
      <div className="saved-urls-empty-icon" aria-hidden="true">
        <BookmarkPlus className="h-6 w-6" />
      </div>
      <div className="saved-urls-empty-copy" aria-live="polite">
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="saved-urls-empty-actions">
        {libraryTotalCount === 0 ? (
          <button type="button" onClick={onAddUrl} className="btn-primary">
            <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
            Add your first URL
          </button>
        ) : (
          <button type="button" onClick={onResetView} className="btn-secondary">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset current view
          </button>
        )}
      </div>
    </div>
  );
};

export default SavedUrlsEmptyState;
