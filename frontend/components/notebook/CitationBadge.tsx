export default function CitationBadge({
  index,
  chunkId,
  onOpenSource,
}: {
  index: number;
  chunkId: string;
  onOpenSource?: (chunkId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenSource?.(chunkId)}
      className="inline-flex items-center justify-center ml-0.5 px-1.5 h-4 rounded-md
                 text-indigo-700 bg-indigo-50 border border-indigo-200 text-[10px] leading-4
                 hover:bg-indigo-100 hover:border-indigo-300 transition"
      title="Open evidence"
      aria-label={`Open evidence ${index}`}
    >
      {index}
    </button>
  );
}
