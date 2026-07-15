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
  mode?: string | null;
  required?: boolean | null;
  attempted?: boolean | null;
  totalWindows?: number | null;
  succeededWindows?: number | null;
  failedWindows?: number | null;
  complete?: boolean | null;
  validationTotalBatches?: number | null;
  validationSucceededBatches?: number | null;
  validationFailedBatches?: number | null;
  rejectedItems?: number | null;
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
  const hasModelCoverage = Boolean(mapCoverage && typeof mapCoverage === "object");
  const mapMode = String(mapCoverage?.mode ?? "missing");
  const mapRequired = mapCoverage?.required === true;
  const mapAttempted = mapCoverage?.attempted === true;
  const totalWindows = Number(mapCoverage?.totalWindows ?? 0);
  const succeededWindows = Number(mapCoverage?.succeededWindows ?? 0);
  const failedWindows = Number(mapCoverage?.failedWindows ?? 0);
  const validationFailedBatches = Number(
    mapCoverage?.validationFailedBatches ?? 0,
  );
  const pageComplete = !hasPageCoverage || coverage?.complete === true;
  const mapComplete =
    hasModelCoverage &&
    mapRequired &&
    mapAttempted &&
    totalWindows > 0 &&
    succeededWindows === totalWindows &&
    failedWindows === 0 &&
    validationFailedBatches === 0 &&
    mapCoverage?.complete === true;
  const complete =
    pageComplete && mapComplete;
  const deterministicOnly = mapMode === "deterministic_only";
  const unavailable = ["unavailable", "disabled", "empty_source", "missing"].includes(
    mapMode,
  );
  const status = complete
    ? "complete"
    : deterministicOnly
      ? "deterministic_only"
      : unavailable
        ? "unavailable"
        : "partial";

  return {
    hasPageCoverage,
    hasModelCoverage,
    hasCoverage: hasPageCoverage || hasModelCoverage,
    complete,
    status,
    statusLabel:
      status === "complete"
        ? "Complete document analysis"
        : status === "deterministic_only"
          ? "Deterministic tags only"
          : status === "unavailable"
            ? "AI mapping unavailable"
            : "Partial document analysis",
    totalPages,
    analyzedPages,
    nativePages: Number(coverage?.nativePages ?? 0),
    ocrPages: Number(coverage?.ocrPages ?? 0),
    blankPages: Number(coverage?.blankPages ?? 0),
    weakPages: Number(coverage?.weakPages ?? 0),
    failedPages: Number(coverage?.failedPages ?? 0),
    totalWindows,
    succeededWindows,
    failedWindows,
    validationFailedBatches,
    rejectedItems: Number(mapCoverage?.rejectedItems ?? 0),
  };
}
