import type { BackendDocumentRevision } from "../../lib/api";

function shortHash(h?: string | null) {
  if (!h) return null;
  const s = String(h);
  return s.length <= 14 ? s : `${s.slice(0, 10)}…${s.slice(-4)}`;
}

export default function RevisionHistoryPanel({
  revisions,
  onOpen,
  onSetA,
  onSetB,
  currentA,
  currentB,
}: {
  revisions: BackendDocumentRevision[];
  onOpen: (storedFileId: string) => void;
  onSetA?: (storedFileId: string) => void;
  onSetB?: (storedFileId: string) => void;
  currentA?: string;
  currentB?: string;
}) {
  return (
    <div className="border rounded-xl p-3 bg-white">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">Revision history</div>
        <div className="text-xs text-gray-500">
          {revisions.length} revision{revisions.length === 1 ? "" : "s"}
        </div>
      </div>

      {revisions.length === 0 ? (
        <div className="text-sm text-gray-500 mt-2">
          No canonical revisions yet. Capture again to create a new revision.
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {revisions.map((r) => {
            const fileId = r.storedFile?.id;
            const isA = currentA && fileId === currentA;
            const isB = currentB && fileId === currentB;

            return (
              <div key={r.id} className="border rounded-lg p-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      Rev {r.ordinal}{" "}
                      <span className="text-xs text-gray-500">
                        • {r.captureType}
                        {r.captureEvent?.pipeline?.name
                          ? ` • ${r.captureEvent.pipeline.name}@${r.captureEvent.pipeline.version}`
                          : ""}
                        {r.contentHash ? ` • ${shortHash(r.contentHash)}` : ""}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(r.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {onSetA && (
                      <button
                        className={`px-2 py-1 border rounded text-xs ${
                          isA ? "bg-black text-white" : ""
                        }`}
                        onClick={() => onSetA(fileId)}
                        title="Set as Compare A"
                      >
                        A
                      </button>
                    )}
                    {onSetB && (
                      <button
                        className={`px-2 py-1 border rounded text-xs ${
                          isB ? "bg-black text-white" : ""
                        }`}
                        onClick={() => onSetB(fileId)}
                        title="Set as Compare B"
                      >
                        B
                      </button>
                    )}
                    <button
                      className="px-2 py-1 border rounded text-xs"
                      onClick={() => onOpen(fileId)}
                      title="Open preview"
                    >
                      Open
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}