export const CHUNK_SPLITTER_VERSION = "semantic-ish-v1";
export const DEFAULT_CHUNK_MAX_CHARS = 1400;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 220;
export const MIN_INGESTIBLE_TEXT_CHARS = 80;

export function assertIngestibleText(
  text: string,
  context: { sourceKind?: string | null; mode?: string | null } = {},
) {
  const cleanLength = (text || "").replace(/\s+/g, " ").trim().length;
  if (cleanLength < MIN_INGESTIBLE_TEXT_CHARS) {
    const mode = context.mode ? ` (${context.mode})` : "";
    throw new Error(
      `Extracted text is too short to index${mode}. Add a better source, retry extraction, or run OCR if this is a scanned PDF.`,
    );
  }
}

export function splitTextWithOffsets(
  text: string,
  maxChars = DEFAULT_CHUNK_MAX_CHARS,
  overlap = DEFAULT_CHUNK_OVERLAP_CHARS,
) {
  const clean = (text || "").replace(/\u0000/g, "").replace(/\r/g, "");
  const out: { text: string; start: number; end: number }[] = [];

  const paragraphRe = /\S[\s\S]*?(?=\n{2,}|\s*$)/g;
  const blocks: { text: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = paragraphRe.exec(clean))) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leftTrim = raw.indexOf(trimmed);
    const start = match.index + Math.max(0, leftTrim);
    blocks.push({ text: trimmed, start, end: start + trimmed.length });
  }

  const pushFixedWindow = (block: { text: string; start: number; end: number }) => {
    let i = 0;
    while (i < block.text.length) {
      const end = Math.min(block.text.length, i + maxChars);
      const raw = block.text.slice(i, end);
      const chunk = raw.trim();
      if (chunk.length >= 40) {
        const leftTrim = raw.indexOf(chunk);
        const start = block.start + i + Math.max(0, leftTrim);
        out.push({ text: chunk, start, end: start + chunk.length });
      }
      if (end >= block.text.length) break;
      i = Math.max(0, end - overlap);
    }
  };

  let current: { text: string; start: number; end: number } | null = null;

  const flush = () => {
    if (!current) return;
    const chunk = current.text.trim();
    if (chunk.length >= 40) {
      const leftTrim = current.text.indexOf(chunk);
      const start = current.start + Math.max(0, leftTrim);
      out.push({ text: chunk, start, end: start + chunk.length });
    }
    const tail = chunk.slice(-overlap).trimStart();
    current =
      tail.length >= 40
        ? { text: tail, start: current.end - tail.length, end: current.end }
        : null;
  };

  for (const block of blocks) {
    if (block.text.length > maxChars) {
      flush();
      pushFixedWindow(block);
      current = null;
      continue;
    }

    if (!current) {
      current = { ...block };
      continue;
    }

    const gap = clean.slice(current.end, block.start);
    const separator = gap.includes("\n") ? "\n\n" : " ";
    const nextText: string = `${current.text}${separator}${block.text}`;
    if (nextText.length > maxChars) {
      flush();
      current = current
        ? {
            text: `${current.text}\n\n${block.text}`,
            start: current.start,
            end: block.end,
          }
        : { ...block };
      if (current.text.length > maxChars) flush();
      continue;
    }

    current = { text: nextText, start: current.start, end: block.end };
  }

  flush();

  return out;
}
