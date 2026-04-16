import type { NBNote, NBSource, NoteProvenanceBundle } from "./notebookClient";

export type NotebookToastDetail = {
  kind: "success" | "error" | "info" | "warning";
  text: string;
};

export type NotebookChatPromptDetail =
  | string
  | {
      prompt: string;
      autoSend?: boolean;
      saveToNotes?: boolean;
      noteTitle?: string;
      noteMode?: "append" | "replace";
    };

export type NotebookAddNoteDetail =
  | string
  | {
      title?: string;
      content: string;
      mode?: "append" | "replace";
      citations?: NoteProvenanceBundle | null;
    };

export type NotebookSourcesPatchDetail = {
  notebookId: string;
  sources: NBSource[];
};

export type NotebookSourcesRollbackDetail = {
  notebookId: string;
};

type NotebookEventMap = {
  toast: NotebookToastDetail;
  "open-note": NBNote;
  "new-note": undefined;
  "add-note": NotebookAddNoteDetail;
  "chat-prompt": NotebookChatPromptDetail;
  "manage-sources": undefined;
  "focus-source": string;
  "sources-optimistic": NotebookSourcesPatchDetail;
  "sources-confirmed": NotebookSourcesPatchDetail;
  "sources-rollback": NotebookSourcesRollbackDetail;
};

type NotebookEventName = keyof NotebookEventMap;

const bus = new EventTarget();

function eventType(name: NotebookEventName) {
  return `nb:${name}`;
}

export function emitNotebookEvent<K extends NotebookEventName>(
  name: K,
  detail: NotebookEventMap[K],
) {
  bus.dispatchEvent(
    new CustomEvent<NotebookEventMap[K]>(eventType(name), { detail }),
  );
}

export function subscribeNotebookEvent<K extends NotebookEventName>(
  name: K,
  handler: (detail: NotebookEventMap[K]) => void,
) {
  const listener: EventListener = (event) => {
    handler((event as CustomEvent<NotebookEventMap[K]>).detail);
  };

  bus.addEventListener(eventType(name), listener);
  return () => bus.removeEventListener(eventType(name), listener);
}
