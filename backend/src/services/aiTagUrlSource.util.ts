type UrlTaggingSnapshot = {
  storagePath: string | null;
  mimeType: string | null;
  captureType: string | null;
  fileName?: string | null;
};

export function looksLikePdfUrlForTagging(url: string | null | undefined) {
  const value = String(url || "").toLowerCase();
  return (
    value.endsWith(".pdf") ||
    value.includes(".pdf?") ||
    value.includes(".pdf&") ||
    value.includes(".pdf#") ||
    (value.includes("filename=") && value.includes(".pdf"))
  );
}

export function looksLikePdfSnapshotForTagging(
  snapshot: UrlTaggingSnapshot | null | undefined,
) {
  const mime = String(snapshot?.mimeType || "").toLowerCase();
  const name = String(snapshot?.fileName || snapshot?.storagePath || "").toLowerCase();
  return (
    snapshot?.captureType === "URL_PDF" ||
    mime.includes("application/pdf") ||
    name.endsWith(".pdf")
  );
}

export function chooseUrlTaggingSource(args: {
  url: string;
  pdfSnapshot?: UrlTaggingSnapshot | null;
  latestSnapshot?: UrlTaggingSnapshot | null;
}): { kind: "file"; path: string } | { kind: "url"; url: string } {
  const pdfSnapshot =
    args.pdfSnapshot && looksLikePdfSnapshotForTagging(args.pdfSnapshot)
      ? args.pdfSnapshot
      : null;

  if (pdfSnapshot?.storagePath) {
    return { kind: "file", path: pdfSnapshot.storagePath };
  }

  if (looksLikePdfUrlForTagging(args.url)) {
    return { kind: "url", url: args.url };
  }

  if (args.latestSnapshot?.storagePath) {
    return { kind: "file", path: args.latestSnapshot.storagePath };
  }

  return { kind: "url", url: args.url };
}
