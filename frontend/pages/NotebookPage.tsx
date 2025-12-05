import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notebookClient as api, Notebook, NBSource } from '../lib/notebookClient';
import UrlIcon from '../components/icons/UrlIcon';
import FolderIcon from '../components/icons/FolderIcon';
import ChatPanel from '../components/notebook/ChatPanel';
import NotesEditor from '../components/notebook/NotesEditor';
import RightPanel from '../components/notebook/RightPanel';
import SourcePicker from '../components/notebook/SourcePicker';
import { ListSkeleton } from '../components/common/Skeleton';
import SmartCard from '../components/ui/SmartCard';
import { StaggerList, StaggerItem } from '../components/motion/StaggerList';
import { PlusButton } from '../components/ui/PlusButton';


function clsx(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(' '); }
const ACTIVE_KEY = 'nb:lastId';

export default function NotebookPage() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'url' | 'file'>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({}); // sourceId -> element

  // data
  const listQ = useQuery({ queryKey: ['nb:list'], queryFn: api.listNotebooks });
  const detailQ = useQuery({ queryKey: ['nb:detail', activeId], queryFn: () => api.getNotebook(activeId!), enabled: !!activeId });
  const sourcesQ = useQuery({ queryKey: ['nb:sources', activeId], queryFn: () => api.listSources(activeId!), enabled: !!activeId });

  // restore last or default
  useEffect(() => { const saved = localStorage.getItem(ACTIVE_KEY); if (saved) setActiveId(saved); }, []);
  useEffect(() => { if (!activeId && listQ.data?.length) setActiveId(listQ.data[0].id); }, [listQ.data, activeId]);
  useEffect(() => { if (activeId) localStorage.setItem(ACTIVE_KEY, activeId); }, [activeId]);

  // create / update
  const createM = useMutation({
    mutationFn: (p: { title: string; description?: string }) => api.createNotebook(p),
    onSuccess: (nb) => { qc.invalidateQueries({ queryKey: ['nb:list'] }); setActiveId(nb.id); },
  });
  const updateTitle = useMutation({
    mutationFn: (p: { id: string; title: string }) => api.updateNotebook(p.id, { title: p.title }),
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: ['nb:list'] }); qc.invalidateQueries({ queryKey: ['nb:detail', vars.id] }); },
  });
  const delSourceM = useMutation({
    mutationFn: (vars: { notebookId: string; sourceId: string }) => api.deleteSource(vars.notebookId, vars.sourceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nb:sources', activeId] }),
  });

  const active: Notebook | null = detailQ.data?.notebook ?? null;

  // highlight + scroll to a source card
  const focusSource = (sourceId: string) => {
    const el = cardRefs.current[sourceId];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-indigo-500', 'animate-pulse');
    setTimeout(() => { el.classList.remove('ring-2', 'ring-indigo-500', 'animate-pulse'); }, 1500);
  };

  // listen for events (when backend maps chunkId -> sourceId, emit nb:focus-source)
  useEffect(() => {
    const onFocus = (e: Event) => {
      const sourceId = (e as CustomEvent).detail as string;
      if (sourceId) focusSource(sourceId);
    };
    window.addEventListener('nb:focus-source', onFocus as any);
    return () => window.removeEventListener('nb:focus-source', onFocus as any);
  }, []);

  // Cmd/Ctrl+K opens picker (Shift selects Files)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPicker(e.shiftKey ? 'file' : 'url');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="p-5 md:p-5">
      <div className="h-full rounded-[28px] border border-emerald-200/80 bg-emerald-50/40 shadow-[0_24px_80px_rgba(15,23,42,0.32)] px-4 md:px-6 py-4 md:py-5 flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr_420px] items-stretch h-full">
      {/* Left rail */}
      <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 shadow-[0_10px_30px_rgba(15,23,42,0.18)] p-3 flex flex-col overflow-hidden backdrop-blur-sm">
        {/* Notebooks */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-800">Notebooks</h2>
            <button
              onClick={() => createM.mutate({ title: `Notebook ${new Date().toLocaleTimeString()}` })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-medium shadow-[0_10px_24px_rgba(15,23,42,0.35)] hover:bg-slate-950 hover:-translate-y-0.5 active:translate-y-[1px] active:shadow-[0_4px_14px_rgba(15,23,42,0.55)] transition-all duration-200 transform"
            >
              New
            </button>
        </div>
        <div className="space-y-1 overflow-auto max-h-44 pr-1 pb-1">
          {listQ.isLoading ? <ListSkeleton rows={4} /> : (listQ.data || []).map(n => (
           <button
             key={n.id}
             onClick={() => setActiveId(n.id)}
             className={clsx(
               'group relative w-full h-9 flex items-center text-left px-3 rounded-md text-sm transition-all duration-200 transform',
               'shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]',
               activeId === n.id
                 ? 'bg-emerald-50/80 text-slate-900 shadow-[0_10px_26px_rgba(16,185,129,0.45)] -translate-y-[1px]'
                 : 'bg-white/85 text-slate-700 hover:bg-emerald-50/70 hover:shadow-[0_10px_24px_rgba(15,23,42,0.14)] hover:-translate-y-[1px]'
             )}
           >
             {/* mint selection rail */}
             <span
               className={clsx(
                 'absolute left-0 top-1/2 -translate-y-1/2 h-5 rounded-r transition-all duration-200',
                 activeId === n.id
                   ? 'w-1.5 bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.5)]'
                   : 'w-[3px] bg-emerald-300/80 opacity-0 group-hover:opacity-100 group-hover:translate-x-[1px]'
               )}
             />
             <span className="truncate">{n.title}</span>
           </button>
         ))}
        </div>

        {/* Sources */}
        <div className="mt-4 border-t pt-3 flex-1 min-h-0">
          <div className="sticky top-0 z-10 flex items-center justify-between mb-2 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-emerald-300/70 px-1 py-2 rounded-t-lg shadow-[0_1px_0_rgba(16,185,129,0.15)]">
            <h3 className="text-xs font-semibold text-slate-800">Sources</h3>
            <div className="flex gap-2">
              <button
                disabled={!activeId}
                onClick={() => setPicker('url')}
                className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-sm disabled:opacity-60"
              >
                <UrlIcon className="w-3 h-3" /> Add URL
              </button>
              <button
                disabled={!activeId}
                onClick={() => setPicker('file')}
                className="text-xs px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1 shadow-sm disabled:opacity-60"
              >
                <FolderIcon className="w-3 h-3" /> Add File
              </button>
            </div>
          </div>

          <StaggerList as="div" className="overflow-auto h-full space-y-2 pr-1 pb-1">
         {sourcesQ.isLoading ? (
           <ListSkeleton rows={6} />
         ) : (
           sourcesQ.data?.map((s: NBSource) => (
             <StaggerItem as="div" key={s.id}>
               <SmartCard
                 as="div"
                 ref={(el) => {
                   if (el) cardRefs.current[s.id] = el as unknown as HTMLDivElement;
                 }}
                 className="group relative flex items-start gap-3 p-3 rounded-lg border border-slate-300/70 bg-white hover:bg-slate-50 hover:shadow-sm transition-colors duration-150 ease-out"
               >
                 <div className="text-xs flex-1 min-w-0">
                   <div className="font-medium truncate text-slate-800">
                     {s.kind === 'URL' ? (s.url?.title || s.url?.url) : s.file?.fileName}
                   </div>
                   <div className="mt-[2px] text-[11px] text-slate-500 truncate">
                     {s.kind === 'URL' ? s.url?.url : (s.file?.mimeType || 'file')}
                   </div>
                 </div>

               <PlusButton
                 variant="ghost"
                 size="sm"
                 aria-label="Remove source"
                 title="Remove"
                 onClick={() =>
                   activeId && delSourceM.mutate({ notebookId: activeId, sourceId: s.id })
                 }
                 className="opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition"
               >
                 ✕
               </PlusButton>
             </SmartCard>
           </StaggerItem>
         ))
       )}
       </StaggerList>
        </div>
      </div>

      {/* Center */}
      <div className="rounded-2xl border border-emerald-300/70 bg-transparent flex flex-col overflow-hidden min-h-[70vh] backdrop-blur-sm">
        <div className="border-b border-emerald-300/70 px-5 py-3 flex items-center gap-3 bg-white/75 backdrop-blur supports-[backdrop-filter]:bg-white/55 sticky top-0 z-10 shadow-[0_1px_0_rgba(16,185,129,0.15)]">
          <input
            value={detailQ.data?.notebook?.title || ''}
            onChange={(e) => activeId && updateTitle.mutate({ id: activeId, title: e.target.value })}
            disabled={!active}
            className="text-xl font-semibold w-full bg-transparent border-none outline-none placeholder:text-slate-400 text-slate-900 focus:ring-2 focus:ring-emerald-400/40 focus:ring-offset-0 rounded-md px-1 -mx-1"
            placeholder="Untitled notebook"
          />
          <div className="ml-auto text-[11px] text-slate-600 bg-slate-100/70 px-2 py-0.5 rounded-md tabular-nums">
            {active ? new Date(active.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </div>
        </div>
        <ChatPanel notebookId={activeId} />
      </div>

      {/* Right */}
      <SmartCard as="section" className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 shadow-[0_10px_30px_rgba(15,23,42,0.16)] flex flex-col overflow-hidden backdrop-blur-sm">
      <NotesEditor notebookId={activeId} />
      <div className="border-t border-emerald-300/70" />
      <RightPanel notebookId={activeId} />
      </SmartCard>

      {/* Picker modal */}
      <SourcePicker open={!!picker} kind={picker || 'url'} notebookId={activeId} onClose={() => setPicker(null)} />
        </div>
      </div>
    </div>
  );
}
