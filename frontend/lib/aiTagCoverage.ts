export type PdfExtractionCoverage = {
  complete?: boolean | null;
  totalPages?: number | null;
  analyzedPages?: number | null;
  nativePages?: number | null;
  ocrPages?: number | null;
  blankPages?: number | null;
  weakPages?: number | null;
  failedPages?: number | null;
};

export type IntelligenceMapCoverage = {
  totalWindows?: number | null;
  succeededWindows?: number | null;
  failedWindows?: number | null;
  complete?: boolean | null;
};

export function deriveAiTagCoverageView(
  extraction?: {
    kind?: string | null;
    pageCount?: number | null;
    unitCount?: number | null;
    coverage?: PdfExtractionCoverage | null;
  } | null,
  mapCoverage?: IntelligenceMapCoverage | null,
) {
  const coverage = extraction?.coverage ?? null;
  const totalPages = Number(coverage?.totalPages ?? extraction?.pageCount ?? 0);
  const analyzedPages = Number(
    coverage?.analyzedPages ?? (totalPages ? extraction?.unitCount ?? 0 : 0),
  );
  const hasPageCoverage = extraction?.kind === "pdf" && totalPages > 0;
  const complete =
    hasPageCoverage &&
    coverage?.complete === true &&
    mapCoverage?.complete !== false;

  return {
    hasPageCoverage,
    complete,
    statusLabel: complete
      ? "Complete document analysis"
      : "Partial document analysis",
    totalPages,
    analyzedPages,
    nativePages: Number(coverage?.nativePages ?? 0),
    ocrPages: Number(coverage?.ocrPages ?? 0),
    blankPages: Number(coverage?.blankPages ?? 0),
    weakPages: Number(coverage?.weakPages ?? 0),
    failedPages: Number(coverage?.failedPages ?? 0),
    totalWindows: Number(mapCoverage?.totalWindows ?? 0),
    succeededWindows: Number(mapCoverage?.succeededWindows ?? 0),
  };
}
