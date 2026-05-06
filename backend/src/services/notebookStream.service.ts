export type NotebookStreamEvent =
  | "run"
  | "status"
  | "delta"
  | "final"
  | "error";

export function formatNotebookSseEvent(event: NotebookStreamEvent, data: any) {
  const safeEvent = String(event || "status").replace(/[^a-z_-]/gi, "");
  const payload = JSON.stringify(data ?? {});
  return `event: ${safeEvent}\ndata: ${payload}\n\n`;
}

export function userSafeNotebookStreamError(error: unknown) {
  const anyError = error as any;
  if (
    anyError?.name === "AbortError" ||
    anyError?.code === "ABORT_ERR" ||
    /abort|cancel/i.test(String(anyError?.message ?? ""))
  ) {
    return "Chat stopped.";
  }

  const status = Number(anyError?.status ?? anyError?.statusCode ?? 500);
  if (status === 404) return "Notebook not found.";
  if (status === 400) return String(anyError?.message || "Invalid chat request.");
  if (status === 429) return "The notebook chat service is busy. Try again in a moment.";
  return "Chat failed. Please try again.";
}
