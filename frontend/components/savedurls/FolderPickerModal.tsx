import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { listFolders, createFolder, getFolder } from '../../lib/api';

type Folder = { id: string; name: string; parentId?: string | null };
type Mode = 'text' | 'pdf';

interface Props {
  open: boolean;
  suggestedName: string;
  mode: Mode;
  onCancel: () => void;
  onConfirm: (opts: { folderId?: string | null; fileName: string; mode: Mode }) => void;
}

const FolderPickerModal: React.FC<Props> = ({ open, suggestedName, mode, onCancel, onConfirm }) => {
  const [current, setCurrent] = useState<string | null>(null); // null = root
  const [stack, setStack] = useState<Folder[]>([]);
  const [children, setChildren] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState(suggestedName);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [currentInfo, setCurrentInfo] = useState<Folder | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  // Which folder in the list is selected as the destination (single click)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Manual double-click detector (more reliable than native dblclick if UI re-renders)
  const lastClickRef = useRef<{ id: string; t: number } | null>(null);
  const DOUBLE_CLICK_MS = 320;

  useEffect(() => {
    if (!open) return;
    setFileName(suggestedName);
    setCurrent(null);
    setStack([]);
    setSelectedFolderId(null);
    lastClickRef.current = null;
  }, [open, suggestedName]);

  const load = useCallback(async (parentId: string | null) => {
    setLoading(true);
    try {
      const res = await listFolders(parentId ?? undefined);
      setChildren(res);
      setSelectedFolderId(null);
      lastClickRef.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
  let active = true;

  // Modal closed → clear state and stop
  if (!open) {
    setCurrentInfo(null);
    setInfoLoading(false);
    return () => { active = false; };
  }

  // Root (no current folder) → clear and stop
  if (!current) {
    setCurrentInfo(null);
    setInfoLoading(false);
    return () => { active = false; };
  }

  setInfoLoading(true);

  (async () => {
    try {
      const info = await getFolder(current);
      if (active) setCurrentInfo(info);
    } catch (e) {
      if (active) setCurrentInfo(null);
      console.error('Failed to load folder info', e);
    } finally {
      if (active) setInfoLoading(false);
    }
  })();

  return () => { active = false; };
  }, [current, open /* , getFolder */]);

  useEffect(() => {
    if (open) {
    load(current);
    }
  }, [open, current, load]);

  const goInto = (f: Folder) => {
    setStack((s) => [...s, f]);
    setCurrent(f.id);
  };

  const handleChildClick = (f: Folder) => {
    const now = Date.now();
    const last = lastClickRef.current;

    // If the same folder is clicked twice quickly → enter it
    if (last && last.id === f.id && now - last.t < DOUBLE_CLICK_MS) {
      lastClickRef.current = null;
      setSelectedFolderId(null);
      goInto(f);
      return;
    }

    // Otherwise just select it as the destination
    lastClickRef.current = { id: f.id, t: now };
    setSelectedFolderId(f.id);
  };

  const goUp = async () => {
    if (stack.length === 0) {
      setCurrent(null);
      return;
    }
    const next = [...stack];
    next.pop();
    setStack(next);
    setCurrent(next.length ? next[next.length - 1].id : null);
  };

  const breadcrumb = useMemo(() => [{ id: '', name: 'Home' }, ...stack], [stack]);

  const handleCreate = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const f = await createFolder(name, current ?? undefined);
      // enter the new folder
      setStack((s) => [...s, f]);
      setCurrent(f.id);
      setNewFolderName('');
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl">
        <div className="px-5 py-4 border-b dark:border-neutral-800 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            Choose destination
            <span className="ml-2 text-sm font-normal text-neutral-500">
              {infoLoading ? '…' : (currentInfo?.name || 'Home')}
            </span>
          </h3>
          <button className="btn-ghost text-sm px-3" onClick={onCancel}>Close</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Breadcrumb */}
          <div className="text-sm text-neutral-600 dark:text-neutral-300">
            {breadcrumb.map((b, i) => (
              <span key={b.id || `root-${i}`}>
                {i > 0 && <span className="mx-1">/</span>}
                <button
                  className="btn-ghost px-1 py-0 text-sm"
                  onClick={() => {
                    const idx = i - 1;
                    const next = stack.slice(0, Math.max(0, idx));
                    setStack(next);
                    setCurrent(next.length ? next[next.length - 1].id : null);
                    setSelectedFolderId(null);
                    lastClickRef.current = null;
                  }}
                >
                  {b.name}
                </button>
              </span>
            ))}
          </div>

          {/* Folder list */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">Folders</div>
              <button className="btn-ghost text-sm px-2" onClick={goUp}>Up</button>
            </div>
            {loading ? (
              <div className="text-sm text-neutral-500">Loading…</div>
            ) : children.length === 0 ? (
              <div className="text-sm text-neutral-500">No folders here.</div>
            ) : (
              <ul className="divide-y dark:divide-neutral-800">
                {children.map((f) => {
                  const active = selectedFolderId === f.id;
                  return (
                    <li key={f.id} className="py-1">
                      <div
                        className={[
                          "flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition cursor-pointer",
                          active
                            ? "bg-brand-primary/10 ring-1 ring-brand-primary/30"
                            : "hover:bg-black/5 dark:hover:bg-white/5",
                        ].join(" ")}
                        onClick={() => handleChildClick(f)}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{f.name}</div>
                          <div className="text-xs text-neutral-500 truncate">Click to select • Double-click to open</div>
                        </div>

                        <button
                          className="btn-outline text-sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedFolderId(null); lastClickRef.current = null; goInto(f); }}
                        >
                          Open
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Create folder */}
          <div className="card">
            <div className="text-sm font-medium mb-2">Create folder here</div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="New folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <button className="btn-outline" disabled={creating || !newFolderName.trim()} onClick={handleCreate}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>

          {/* File name + confirm */}
          <div className="card">
            <div className="text-sm font-medium mb-2">File name</div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={mode === 'pdf' ? 'page.pdf' : 'page.txt'}
              />
              <button
                className="btn-primary"
                onClick={() => onConfirm({ folderId: (selectedFolderId ?? current), fileName, mode })}
                disabled={!fileName.trim()}
              >
                Save here
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FolderPickerModal;
