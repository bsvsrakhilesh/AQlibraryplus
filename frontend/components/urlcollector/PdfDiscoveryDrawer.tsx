import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  crawlSavePdf,
  discoverPdfDocuments,
  fetchDiscoveredPdfDocuments,
  type DiscoveredPdfDocument,
  type PdfDiscoverySummary,
} from "../../lib/api";
import FolderPickerModal from "./FolderPickerModal";
import CloseIcon from "../icons/CloseIcon";
import { useDialogA11y } from "../common/useDialogA11y";

type Props = {
  open: boolean;
  sourceUrlId: number | null;
  sourceUrl: string;
  sourceTitle?: string;
  query?: string | null;
  autoDiscover?: boolean;
  onClose: () => void;
  onAfterCapture?: () => void | Promise<void>;
};

type Notice = { type: "success" | "error" | "info"; text: string } | null;

const EMPTY_SUMMARY: PdfDiscoverySummary = {
  discoveredCount: 0,
  capturedCount: 0,
  verifiedCount: 0,
  lastDiscoveredAt: null,
};

function formatBytes(n?: number | null) {
  if (!n || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function sanitizePdfName(raw: string) {
  const stem =
    String(raw || "document")
      .replace(/\s+/g, " ")
      .replace(/[\\/:*?"<>|]+/g, "_")
      .trim()
      .slice(0, 140) || "document";
  return stem.toLowerCase().endsWith(".pdf") ? stem : `${stem}.pdf`;
}

function suggestedFileName(doc: DiscoveredPdfDocument) {
  return sanitizePdfName(
    doc.fileNameHint ||
      doc.title ||
      doc.anchorText ||
      doc.url.split(/[/?#]/).filter(Boolean).pop() ||
      "document",
  );
}

function confidenceClass(confidence: string) {
  if (confidence === "high") return "chip chip-emerald";
  if (confidence === "medium") return "chip chip-amber";
  return "chip chip-gray";
}

function methodLabel(method: string) {
  return method
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

const PdfDiscoveryDrawer: React.FC<Props> = ({
  open,
  sourceUrlId,
  sourceUrl,
  sourceTitle,
  query,
  autoDiscover = false,
  onClose,
  onAfterCapture,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const autoKeyRef = useRef<string>("");

  const [documents, setDocuments] = useState<DiscoveredPdfDocument[]>([]);
  const [summary, setSummary] = useState<PdfDiscoverySummary>(EMPTY_SUMMARY);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [capturePickerOpen, setCapturePickerOpen] = useState(false);
  const [pageSnapshotPickerOpen, setPageSnapshotPickerOpen] = useState(false);
  const [captureTargets, setCaptureTargets] = useState<DiscoveredPdfDocument[]>(
    [],
  );
  const [capturing, setCapturing] = useState(false);
  const [captureDone, setCaptureDone] = useState(0);
  const [captureFailures, setCaptureFailures] = useState<
    Array<{ id: string; title: string; error: string }>
  >([]);
  const [notice, setNotice] = useState<Notice>(null);

  useDialogA11y({
    isOpen: open,
    onClose,
    dialogRef,
    initialFocusRef: closeRef,
    closeOnOutsideClick: !capturePickerOpen && !pageSnapshotPickerOpen,
  });

  const uncaptured = useMemo(
    () =>
      documents.filter(
        (doc) =>
          doc.status !== "CAPTURED" &&
          !doc.capturedAt &&
          !(doc.capturedFiles && doc.capturedFiles.length > 0),
      ),
    [documents],
  );

  const selectedDocs = useMemo(
    () => documents.filter((doc) => selected.has(doc.id)),
    [documents, selected],
  );

  const load = useCallback(
    async (runDiscovery: boolean) => {
      if (!sourceUrlId) return;
      setNotice(null);
      if (runDiscovery) setDiscovering(true);
      else setLoading(true);

      try {
        const out = runDiscovery
          ? await discoverPdfDocuments(sourceUrlId, {
              query,
              maxDepth: 1,
              useBrowserFallback: true,
            })
          : await fetchDiscoveredPdfDocuments(sourceUrlId);
        setDocuments(out.documents || []);
        setSummary(out.summary || EMPTY_SUMMARY);
        setSelected(new Set());
        if (runDiscovery) {
          const count = out.documents?.length || 0;
          setNotice({
            type: count ? "success" : "info",
            text: count
              ? `Found ${count} PDF candidate${count === 1 ? "" : "s"}.`
              : "No PDF candidates were found on this page.",
          });
        }
      } catch (error: any) {
        setNotice({
          type: "error",
          text: error?.message || "PDF discovery failed.",
        });
      } finally {
        setLoading(false);
        setDiscovering(false);
      }
    },
    [query, sourceUrlId],
  );

  useEffect(() => {
    if (!open || !sourceUrlId) return;
    const key = `${sourceUrlId}:${autoDiscover ? "auto" : "view"}:${query || ""}`;
    if (autoDiscover && autoKeyRef.current !== key) {
      autoKeyRef.current = key;
      void load(true);
    } else {
      void load(false);
    }
  }, [autoDiscover, load, open, query, sourceUrlId]);

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllUncaptured = () => {
    setSelected(new Set(uncaptured.map((doc) => doc.id)));
  };

  const openCapturePicker = (targets: DiscoveredPdfDocument[]) => {
    if (!targets.length) {
      setNotice({ type: "info", text: "Choose at least one uncaptured PDF." });
      return;
    }
    setCaptureTargets(targets);
    setCaptureFailures([]);
    setCaptureDone(0);
    setCapturePickerOpen(true);
  };

  const runCapture = async (opts: {
    folderId?: string | null;
    fileName: string;
    mode: "text" | "pdf";
    accessMode?: "public" | "institutional";
  }) => {
    if (!sourceUrlId) return;
    setCapturePickerOpen(false);
    setCapturing(true);
    setCaptureDone(0);
    setCaptureFailures([]);

    const failures: Array<{ id: string; title: string; error: string }> = [];
    for (const doc of captureTargets) {
      try {
        await crawlSavePdf(
          doc.url,
          opts.folderId ?? undefined,
          suggestedFileName(doc),
          true,
          true,
          sourceUrlId,
          opts.accessMode || "public",
          {
            discoveredDocumentId: doc.id,
            captureScope: "DISCOVERED_DOCUMENT",
            sourcePageUrl: sourceUrl,
            originalSearchQuery: query || null,
          },
        );
      } catch (error: any) {
        failures.push({
          id: doc.id,
          title: doc.title,
          error: error?.message || "Capture failed",
        });
      } finally {
        setCaptureDone((n) => n + 1);
      }
    }

    setCaptureFailures(failures);
    setCapturing(false);
    await load(false);
    await onAfterCapture?.();

    const succeeded = captureTargets.length - failures.length;
    setNotice({
      type: failures.length ? "error" : "success",
      text: failures.length
        ? `Captured ${succeeded} of ${captureTargets.length} PDFs.`
        : `Captured ${succeeded} PDF${succeeded === 1 ? "" : "s"}.`,
    });
    setCaptureTargets([]);
  };

  const runPageSnapshotCapture = async (opts: {
    folderId?: string | null;
    fileName: string;
    mode: "text" | "pdf";
    accessMode?: "public" | "institutional";
  }) => {
    if (!sourceUrlId) return;
    setPageSnapshotPickerOpen(false);
    setCapturing(true);
    setCaptureDone(0);
    setCaptureFailures([]);

    try {
      await crawlSavePdf(
        sourceUrl,
        opts.folderId ?? undefined,
        opts.fileName || sanitizePdfName(sourceTitle || "page"),
        true,
        true,
        sourceUrlId,
        opts.accessMode || "public",
      );
      await onAfterCapture?.();
      setNotice({ type: "success", text: "Captured page PDF snapshot." });
    } catch (error: any) {
      setNotice({
        type: "error",
        text: error?.message || "Page snapshot capture failed.",
      });
    } finally {
      setCapturing(false);
    }
  };

  if (!open) return null;

  const busy = loading || discovering;
  const captureTotal = captureTargets.length;

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-sm" />
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Discovered PDFs"
        className="fixed right-0 top-0 z-[91] flex h-full w-full max-w-4xl flex-col border-l border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-950"
      >
        <header className="border-b border-black/10 px-5 py-4 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                PDF harvest
              </div>
              <h2 className="mt-1 line-clamp-2 text-xl font-semibold text-neutral-950 dark:text-white">
                {sourceTitle || "Discovered PDFs"}
              </h2>
              <div className="mt-1 truncate text-xs text-neutral-500">
                {sourceUrl}
              </div>
            </div>

            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="btn-ghost inline-flex h-10 w-10 items-center justify-center rounded-xl p-0"
              aria-label="Close"
              title="Close"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="chip chip-slate">
              {summary.discoveredCount} discovered
            </span>
            <span className="chip chip-emerald">
              {summary.capturedCount} captured
            </span>
            <span className="chip chip-sky">
              {summary.verifiedCount} verified
            </span>
            {summary.lastDiscoveredAt && (
              <span className="chip chip-gray">
                Last harvest: {formatDate(summary.lastDiscoveredAt)}
              </span>
            )}
          </div>
        </header>

        <div className="border-b border-black/10 px-5 py-3 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-primary rounded-full px-4 py-2 text-sm"
                disabled={busy || capturing}
                onClick={() => void load(true)}
              >
                {discovering ? "Harvesting..." : "Harvest again"}
              </button>
              <button
                type="button"
                className="btn-ghost rounded-full px-4 py-2 text-sm"
                disabled={!uncaptured.length || busy || capturing}
                onClick={selectAllUncaptured}
              >
                Select uncaptured
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-ghost rounded-full px-4 py-2 text-sm"
                disabled={!selectedDocs.length || capturing}
                onClick={() => openCapturePicker(selectedDocs)}
              >
                Capture selected ({selectedDocs.length})
              </button>
              <button
                type="button"
                className="btn-primary rounded-full px-4 py-2 text-sm"
                disabled={!uncaptured.length || capturing}
                onClick={() => openCapturePicker(uncaptured)}
              >
                Capture all ({uncaptured.length})
              </button>
            </div>
          </div>

          {notice && (
            <div
              className={[
                "mt-3 rounded-xl border px-3 py-2 text-sm",
                notice.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : notice.type === "error"
                    ? "border-red-200 bg-red-50 text-red-800"
                    : "border-sky-200 bg-sky-50 text-sky-800",
              ].join(" ")}
            >
              {notice.text}
            </div>
          )}

          {capturing && (
            <div className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
              {captureTotal > 0
                ? `Capturing ${captureDone} / ${captureTotal} PDFs...`
                : "Capturing page snapshot..."}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {busy && !documents.length ? (
            <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center text-sm text-neutral-500 dark:border-white/10">
              Looking through the page for PDF documents...
            </div>
          ) : documents.length ? (
            <div className="space-y-3">
              {documents.map((doc) => {
                const captured =
                  doc.status === "CAPTURED" ||
                  !!doc.capturedAt ||
                  !!doc.capturedFiles?.length;
                const date = formatDate(doc.dateHint);
                const size = formatBytes(doc.contentLength);
                return (
                  <article
                    key={doc.id}
                    className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900"
                  >
                    <div className="grid grid-cols-[auto,1fr] gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={selected.has(doc.id)}
                        disabled={captured}
                        onChange={() => toggleSelected(doc.id)}
                        aria-label={`Select ${doc.title}`}
                      />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="line-clamp-2 text-sm font-semibold text-neutral-950 dark:text-white">
                            {doc.title}
                          </h3>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <span className={confidenceClass(doc.confidence)}>
                              {Math.round(doc.score * 100)}%
                            </span>
                            {doc.verified && (
                              <span className="chip chip-emerald">
                                Verified PDF
                              </span>
                            )}
                            {captured && (
                              <span className="chip chip-violet">
                                Captured
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                          {date && <span>{date}</span>}
                          {size && <span>{size}</span>}
                          <span>{methodLabel(doc.discoveryMethod)}</span>
                          {doc.fileNameHint && <span>{doc.fileNameHint}</span>}
                        </div>

                        {doc.contextText && (
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-700 dark:text-neutral-300">
                            {doc.contextText}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-ghost rounded-full px-3 py-1.5 text-xs"
                          >
                            Open PDF
                          </a>
                          <button
                            type="button"
                            className="btn-ghost rounded-full px-3 py-1.5 text-xs"
                            onClick={() => navigator.clipboard?.writeText(doc.url)}
                          >
                            Copy URL
                          </button>
                          {!captured && (
                            <button
                              type="button"
                              className="btn-primary rounded-full px-3 py-1.5 text-xs"
                              onClick={() => openCapturePicker([doc])}
                            >
                              Capture
                            </button>
                          )}
                        </div>

                        {doc.captureError && (
                          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                            {doc.captureError}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center dark:border-white/10">
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                No PDFs discovered yet
              </div>
              <p className="mt-2 text-sm text-neutral-500">
                Harvest the source page to look for linked, embedded, or
                browser-visible PDF documents.
              </p>
              <button
                type="button"
                className="btn-ghost mt-4 rounded-full px-4 py-2 text-sm"
                disabled={capturing || !sourceUrlId}
                onClick={() => setPageSnapshotPickerOpen(true)}
              >
                Capture page snapshot instead
              </button>
            </div>
          )}

          {captureFailures.length > 0 && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <div className="font-semibold">Capture failures</div>
              <ul className="mt-2 space-y-1">
                {captureFailures.map((failure) => (
                  <li key={failure.id}>
                    {failure.title}: {failure.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>

      <FolderPickerModal
        open={capturePickerOpen}
        suggestedName="discovered-pdfs.pdf"
        mode="pdf"
        fileNameMode="hidden"
        onCancel={() => setCapturePickerOpen(false)}
        onConfirm={runCapture}
      />

      <FolderPickerModal
        open={pageSnapshotPickerOpen}
        suggestedName={sanitizePdfName(sourceTitle || "page")}
        mode="pdf"
        onCancel={() => setPageSnapshotPickerOpen(false)}
        onConfirm={runPageSnapshotCapture}
      />
    </>
  );
};

export default PdfDiscoveryDrawer;
