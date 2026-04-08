import React, { useEffect, useMemo, useState } from "react";
import { Collection } from "../../lib/types";
import CloseIcon from "../icons/CloseIcon";

interface Props {
  isOpen: boolean;
  title?: string;
  description?: string;
  collections: Collection[];
  selectedCount?: number;
  onCancel: () => void;
  onConfirm?: (collectionId: string) => void;
  onAddToCollection?: (collectionId: string) => void | Promise<void>;
  onMoveToCollection?: (collectionId: string) => void | Promise<void>;
  onRequestCreate?: () => void;
}

const CollectionPickerModal: React.FC<Props> = ({
  isOpen,
  title = "Choose collection",
  description,
  collections,
  selectedCount,
  onCancel,
  onConfirm,
  onAddToCollection,
  onMoveToCollection,
  onRequestCreate,
}) => {
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }

    if (isOpen) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen) return;

    setSelectedId((prev) => {
      if (prev && collections.some((c) => c.id === prev)) return prev;
      return collections[0]?.id ?? "";
    });
  }, [isOpen, collections]);

  const selectedCollection = useMemo(
    () => collections.find((c) => c.id === selectedId),
    [collections, selectedId],
  );

  const hasDualActions = !!onAddToCollection || !!onMoveToCollection;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border bg-white p-4 shadow-xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-950 dark:text-neutral-100">
              {title}
            </h3>
            {(description || selectedCount !== undefined) && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                {description}
                {description && selectedCount !== undefined ? " " : ""}
                {selectedCount !== undefined
                  ? `Selected: ${selectedCount} URL${selectedCount === 1 ? "" : "s"}.`
                  : null}
              </p>
            )}
          </div>

          <button
            className="btn-ghost"
            onClick={onCancel}
            title="Close"
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-auto">
          {collections.map((c) => {
            const active = c.id === selectedId;

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={[
                  "w-full rounded-xl border px-3 py-3 text-left transition",
                  active
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                    : "border-black/10 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-neutral-800",
                ].join(" ")}
              >
                <div className="font-medium">{c.name}</div>
                <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {active ? "Selected destination" : "Choose this collection"}
                </div>
              </button>
            );
          })}

          {collections.length === 0 && (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No collections available yet.
            </div>
          )}
        </div>

        {onRequestCreate && (
          <div className="mt-4 border-t pt-3">
            <button
              type="button"
              onClick={onRequestCreate}
              className="w-full rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              + Create new collection
            </button>
          </div>
        )}

        <div className="mt-4 border-t pt-4">
          {hasDualActions ? (
            <>
              <div className="mb-3 rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-white/10 dark:bg-neutral-950/40 dark:text-neutral-300">
                <strong>Add to collection</strong> keeps existing memberships.{" "}
                <strong>Move only here</strong> replaces existing memberships
                with the selected collection.
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>

                {onAddToCollection && (
                  <button
                    type="button"
                    disabled={!selectedCollection}
                    onClick={() => {
                      if (!selectedId) return;
                      void onAddToCollection(selectedId);
                    }}
                    className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-50 dark:hover:bg-neutral-800"
                  >
                    Add to collection
                  </button>
                )}

                {onMoveToCollection && (
                  <button
                    type="button"
                    disabled={!selectedCollection}
                    onClick={() => {
                      if (!selectedId) return;
                      void onMoveToCollection(selectedId);
                    }}
                    className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
                  >
                    Move only here
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!selectedCollection}
                onClick={() => {
                  if (!selectedId || !onConfirm) return;
                  onConfirm(selectedId);
                }}
                className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollectionPickerModal;
