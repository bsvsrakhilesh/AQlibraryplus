import { useNavigate } from "react-router-dom";
import { LayoutGrid, ArrowRight } from "lucide-react";

export default function NotebookTopNav() {
  const navigate = useNavigate();

  return (
    <div className="app-header w-full z-[100] bg-background/80 backdrop-blur-xl border-b border-border/60 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
      <div className="app-header__inner h-24 lg:h-[72px] flex items-center justify-between gap-2 max-w-screen-2xl mx-auto w-full transition-[height] duration-200">
        {/* Left: brand + page label */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/")}
            className="group rounded-lg px-2 py-1 flex items-center gap-2 hover:bg-muted/70 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-primary/60"
            title="Back to Landing"
            aria-label="Back to Landing"
          >
            <span className="relative inline-flex">
              <img
                src="/assets/logo.png"
                alt="Smart Scrape"
                className="w-6 h-6 rounded shadow-sm transition-transform duration-200 group-hover:scale-[1.04]"
              />
              <span className="pointer-events-none absolute inset-0 rounded-full ring-0 ring-brand-primary/40 opacity-0 group-hover:opacity-100 group-hover:ring-2 transition-all duration-200" />
            </span>

            <span className="hidden sm:inline text-sm font-semibold tracking-wide">
              Smart Scrape
              <span className="block h-[2px] w-0 bg-gradient-to-r from-brand-primary/80 to-brand-secondary/80 rounded-full mt-[2px] group-hover:w-full transition-all duration-200 ease-out" />
            </span>
          </button>

          <span className="hidden sm:inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-slate-700 bg-white/60 ring-1 ring-black/5">
            Notebook
          </span>
        </div>

        {/* Right: "Open App" */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-900 bg-white/70 ring-1 ring-black/5 hover:bg-white transition"
            title="Open App"
          >
            <LayoutGrid className="h-4 w-4" />
            Open App <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[2px] bg-gradient-to-r from-brand-primary/80 via-brand-secondary/80 to-brand-primary/40" />
    </div>
  );
}
