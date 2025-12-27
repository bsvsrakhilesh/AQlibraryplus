import { useEffect, useMemo, useState } from 'react';
import { notebookClient as api, ChunkDetail } from '../../lib/notebookClient';

function clsx(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ');
}

function sourceTitle(s: ChunkDetail['source']) {
  if (s.kind === 'URL') return s.url?.title || s.url?.url || 'URL Source';
  return s.file?.fileName || 'File Source';
}

function sourceSub(s: ChunkDetail['source']) {
  if (s.kind === 'URL') return s.url?.url || '';
  return s.file?.mimeType || '';
}

export default function EvidenceDrawer({
  open,
  chunkId,
  onClose,
}: {
  open: boolean;
  chunkId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [chunk, setChunk] = useState<ChunkDetail | null>(null);

  useEffect(() => {
    if (!open || !chunkId) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setChunk(null);
        const data = await api.getChunk(chunkId);
        if (!cancelled) setChunk(data);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load citation evidence.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, chunkId]);

  const title = useMemo(() => (chunk ? sourceTitle(chunk.source) : 'Evidence'), [chunk]);
  const sub = useMemo(() => (chunk ? sourceSub(chunk.source) : ''), [chunk]);

  const jumpToSource = () => {
    if (!chunk) return;
    window.dispatchEvent(new CustomEvent('nb:focus-source', { detail: chunk.sourceId }));
    onClose();
  };

  const copy = async () => {
    if (!chunk) return;
    await navigator.clipboard.writeText(chunk.text || '');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* backdrop */}
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close evidence drawer"
      />

      {/* panel */}
      <div
        className={clsx(
          'absolute right-0 top-0 h-full w-full sm:w-[520px]',
          'bg-white shadow-[0_40px_120px_rgba(15,23,42,0.35)]',
          'border-l border-slate-200/80'
        )}
      >
        <div className="h-full flex flex-col">
          {/* header */}
          <div className="px-5 py-4 border-b border-slate-200/80 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase">
                  Evidence
                </div>
                <div className="mt-1 text-[16px] font-semibold text-slate-900 truncate">
                  {title}
                </div>
                {sub ? (
                  <div className="mt-1 text-[12px] text-slate-500 truncate">{sub}</div>
                ) : null}
              </div>

              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 text-[12px] font-semibold"
              >
                Close
              </button>
            </div>
          </div>

          {/* body */}
          <div className="flex-1 overflow-auto p-5">
            {loading && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Loading evidence…
              </div>
            )}

            {err && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {err}
              </div>
            )}

            {chunk && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-[11px] text-slate-500 mb-2">
                    Chunk #{chunk.idx + 1}
                  </div>
                  <div className="text-sm leading-relaxed text-slate-900 whitespace-pre-wrap">
                    {chunk.text}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={jumpToSource}
                    className="px-4 py-2 rounded-full bg-slate-900 text-white text-[12px] font-semibold shadow-[0_18px_50px_rgba(15,23,42,0.25)] hover:bg-black"
                  >
                    Open & highlight source
                  </button>

                  <button
                    onClick={copy}
                    className="px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700 text-[12px] font-semibold hover:bg-slate-50"
                  >
                    Copy evidence
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* footer */}
          <div className="px-5 py-3 border-t border-slate-200/80 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/60 text-[11px] text-slate-500">
            Tip: citations are clickable — use them to verify claims fast.
          </div>
        </div>
      </div>
    </div>
  );
}
