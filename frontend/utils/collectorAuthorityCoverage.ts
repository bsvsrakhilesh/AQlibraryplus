export type CollectorAuthorityCoverageSource = {
  key: string;
  label: string;
  domain: string;
  evidenceRole: string;
  confidence: number;
};

export type CollectorAuthorityCoverageRow = CollectorAuthorityCoverageSource & {
  resultCount: number;
  exampleTitle: string;
  covered: boolean;
  gapSeverity: "covered" | "critical" | "important" | "watch";
};

export type CollectorEvidenceRoleCoverage = {
  role: string;
  covered: number;
  total: number;
  confidence: number;
};

export type CollectorAuthorityCoverageSummary = {
  coverage: CollectorAuthorityCoverageRow[];
  missingCount: number;
  criticalMissingCount: number;
  score: number;
  risk: "high" | "medium" | "watch" | "low";
  riskLabel: string;
  missingSources: CollectorAuthorityCoverageRow[];
  roleCoverage: CollectorEvidenceRoleCoverage[];
  missingRoles: string[];
};

type CollectorCoverageResult = {
  url?: string;
  title?: string;
};

export function collectorHostFromUrl(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = /^[a-z][a-z0-9+\-.]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[/?#\s]/)[0]
      .toLowerCase();
  }
}

export function collectorHostMatchesAuthority(
  resultHost: string,
  authorityDomain: string,
): boolean {
  const host = collectorHostFromUrl(resultHost);
  const domain = collectorHostFromUrl(authorityDomain);
  return !!host && !!domain && (host === domain || host.endsWith(`.${domain}`));
}

export function summarizeCollectorAuthorityCoverage(
  sources: CollectorAuthorityCoverageSource[],
  results: CollectorCoverageResult[],
): CollectorAuthorityCoverageSummary {
  const coverage = sources.map((source) => {
    const matchingRows = results.filter((row) =>
      collectorHostMatchesAuthority(row.url ?? "", source.domain),
    );
    const gapSeverity: CollectorAuthorityCoverageRow["gapSeverity"] =
      matchingRows.length > 0
        ? "covered"
        : source.confidence >= 80
          ? "critical"
          : source.confidence >= 60
            ? "important"
            : "watch";
    return {
      ...source,
      resultCount: matchingRows.length,
      exampleTitle: matchingRows[0]?.title ?? "",
      covered: matchingRows.length > 0,
      gapSeverity,
    };
  });

  const missingCount = coverage.filter((source) => !source.covered).length;
  const criticalMissingCount = coverage.filter(
    (source) => source.gapSeverity === "critical",
  ).length;
  const totalWeight = coverage.reduce(
    (sum, source) => sum + Math.max(1, source.confidence),
    0,
  );
  const coveredWeight = coverage.reduce(
    (sum, source) => sum + (source.covered ? Math.max(1, source.confidence) : 0),
    0,
  );
  const score = totalWeight ? Math.round((coveredWeight / totalWeight) * 100) : 100;
  const risk =
    criticalMissingCount > 0
      ? "high"
      : score < 70
        ? "medium"
        : missingCount > 0
          ? "watch"
          : "low";
  const riskLabel =
    risk === "high"
      ? "High evidence risk"
      : risk === "medium"
        ? "Medium evidence risk"
        : risk === "watch"
          ? "Watch evidence risk"
          : "Low evidence risk";

  const roleMap = new Map<string, CollectorEvidenceRoleCoverage>();
  coverage.forEach((source) => {
    const role = source.evidenceRole || "Official source";
    const current =
      roleMap.get(role) ?? { role, covered: 0, total: 0, confidence: 0 };
    current.total += 1;
    current.covered += source.covered ? 1 : 0;
    current.confidence = Math.max(current.confidence, source.confidence);
    roleMap.set(role, current);
  });
  const roleCoverage = Array.from(roleMap.values()).sort((a, b) => {
    const aMissing = a.covered === 0 ? 1 : 0;
    const bMissing = b.covered === 0 ? 1 : 0;
    if (aMissing !== bMissing) return bMissing - aMissing;
    return b.confidence - a.confidence;
  });
  const missingRoles = roleCoverage
    .filter((role) => role.covered === 0)
    .map((role) => role.role);

  return {
    coverage,
    missingCount,
    criticalMissingCount,
    score,
    risk,
    riskLabel,
    missingSources: coverage
      .filter((source) => !source.covered)
      .sort((a, b) => b.confidence - a.confidence),
    roleCoverage,
    missingRoles,
  };
}
