function httpError(status: number, message: string) {
  const err: any = new Error(message);
  err.status = status;
  return err;
}

export function normalizeNoteProvenance(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "object") {
    throw httpError(400, "Invalid note provenance payload.");
  }

  const bundle = value as any;
  if (
    bundle.version !== "note-provenance-v1" ||
    !Array.isArray(bundle.artifacts)
  ) {
    throw httpError(400, "Invalid note provenance payload.");
  }

  if (bundle.artifacts.length > 30) {
    throw httpError(400, "Note provenance has too many artifacts.");
  }

  return {
    version: "note-provenance-v1",
    artifacts: bundle.artifacts.map((artifact: any) => ({
      ...artifact,
      kind:
        artifact?.kind === "template-note" ? "template-note" : "chat-answer",
      createdAt:
        typeof artifact?.createdAt === "string"
          ? artifact.createdAt
          : new Date().toISOString(),
      answer: String(artifact?.answer ?? "").slice(0, 200000),
      citations: Array.isArray(artifact?.citations)
        ? artifact.citations.slice(0, 200)
        : [],
      evidence: Array.isArray(artifact?.evidence)
        ? artifact.evidence.slice(0, 100)
        : undefined,
      claimLinks: Array.isArray(artifact?.claimLinks)
        ? artifact.claimLinks.slice(0, 100)
        : undefined,
    })),
  };
}
