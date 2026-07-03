import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface TextEntryModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  value: string;
  placeholder?: string;
  submitLabel: string;
  busy?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
}

const TextEntryModal: React.FC<TextEntryModalProps> = ({
  open,
  onClose,
  title,
  description,
  value,
  placeholder,
  submitLabel,
  busy = false,
  onChange,
  onSubmit,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || busy) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, busy]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={busy ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative z-101 w-full max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
      >
        <div className="border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id={titleId}
                className="text-base font-semibold text-neutral-950 dark:text-neutral-100"
              >
                {title}
              </h3>
              <p
                id={descriptionId}
                className="mt-1 text-sm text-neutral-600 dark:text-neutral-300"
              >
                {description}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              Close
            </button>
          </div>
        </div>

        <form
          className="space-y-4 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={busy || !value.trim()}
              className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-95 disabled:opacity-50"
            >
              {busy ? "Saving..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default TextEntryModal;
