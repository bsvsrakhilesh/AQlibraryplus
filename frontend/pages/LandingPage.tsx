// frontend/pages/LandingPage.tsx
import React, { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionProps,
  type Transition,
} from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  FileText,
  FolderOpen,
  Link as LinkIcon,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";

/* ========================
   Motion presets
   ======================== */
const EASE: Transition["ease"] = [0.16, 1, 0.3, 1];
const fadeUp = (delay = 0): MotionProps => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE, delay },
  viewport: { once: true, amount: 0.35 },
});

/* ========================
   Tiny UX utilities
   ======================== */
const MagneticButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className = "", children, ...rest }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2;
    const my = e.clientY - r.top - r.height / 2;
    el.style.setProperty("--tx", `${mx * 0.12}px`);
    el.style.setProperty("--ty", `${my * 0.12}px`);
  }, []);
  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", "0px");
    el.style.setProperty("--ty", "0px");
  }, []);
  return (
    <button
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`magnetic ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

/* ========================
   Top navigation
   ======================== */
function LandingNav() {
  const navigate = useNavigate();

  const items = [{ label: "Features", href: "#features" }];

  return (
    <div className="fixed inset-x-0 top-0 z-50">
      <div className="landing-topbar">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between gap-3">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="group flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-white/40 transition"
              aria-label="Smart Scrape Home"
              title="Smart Scrape"
            >
              <span className="relative inline-flex">
                <img
                  src="/assets/logo.png"
                  alt="Smart Scrape"
                  className="h-8 w-8 rounded-xl shadow-sm ring-1 ring-black/5"
                />
                <span className="pointer-events-none absolute inset-0 rounded-xl ring-0 ring-emerald-300/60 opacity-0 group-hover:opacity-100 group-hover:ring-2 transition" />
              </span>
              <span className="hidden sm:inline text-sm font-semibold tracking-wide text-slate-900">
                Smart Scrape
                <span className="block h-[2px] w-0 bg-gradient-to-r from-emerald-500/80 to-sky-500/80 rounded-full mt-[2px] group-hover:w-full transition-all duration-200 ease-out" />
              </span>
            </button>

            <nav className="hidden md:flex items-center gap-1 text-sm">
              {items.map((it) => (
                <a
                  key={it.href}
                  href={it.href}
                  className="px-3 py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-white/40 transition"
                >
                  {it.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <MagneticButton
                onClick={() => navigate("/app")}
                className="landing-primary-btn inline-flex items-center gap-2"
              >
                Open App <ArrowRight className="h-4 w-4" />
              </MagneticButton>
              <MagneticButton
                onClick={() => navigate("/notebook")}
                className="landing-primary-btn inline-flex items-center gap-2 h-9 px-3 py-2"
                title="Open Notebook"
                aria-label="Open Notebook"
                type="button"
              >
                <span className="hidden sm:inline">Open Notebook</span>
                <BookOpen className="h-4 w-4" />
              </MagneticButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================
   Hero
   ======================== */
function Hero() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const blur = useTransform(
    scrollYProgress,
    [0, 1],
    ["blur(42px)", "blur(82px)"]
  );

  const onMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <section
      ref={ref}
      className="relative overflow-hidden spotlight"
      onMouseMove={onMouseMove}
    >
      <div className="landing-hero-bg">
        {/* mesh + glow */}
        <motion.div
          aria-hidden
          style={{ y, filter: blur }}
          className="pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-white/20 blur-3xl"
        />
        <div aria-hidden className="landing-noise" />

        <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-14 md:pt-28 md:pb-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
              <motion.div
                className="inline-flex items-center gap-2 rounded-full bg-white/35 px-3 py-1 text-sm text-slate-800 ring-1 ring-white/50"
                {...fadeUp(0)}
              >
                <Wand2 className="h-4 w-4" />
                Research workflow, cleaned up.
              </motion.div>

              <motion.h1
                className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl"
                {...fadeUp(0.08)}
              >
                Turn links & files into a
                <span className="block landing-gradient-text">
                  structured knowledge workspace
                </span>
              </motion.h1>

              <motion.p
                className="mt-5 max-w-xl text-slate-700 md:text-lg"
                {...fadeUp(0.16)}
              >
                Smart Scrape gives you four tightly-connected pages: collect
                sources, auto-tag & organize them, manage files, and synthesize
                everything into notebooks — all designed for speed and ease.
              </motion.p>

              <motion.div
                className="mt-8 flex flex-wrap items-center gap-3"
                {...fadeUp(0.24)}
              >
                <MagneticButton
                  onClick={() => navigate("/app")}
                  className="landing-primary-btn inline-flex items-center gap-2"
                >
                  Open App <ArrowRight className="h-4 w-4" />
                </MagneticButton>
                <MagneticButton
                  onClick={() => navigate("/notebook")}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-800 bg-white/40 ring-1 ring-white/60 hover:bg-white/55 transition"
                >
                  Open Notebook <BookOpen className="h-4 w-4" />
                </MagneticButton>
                <a
                  href="#features"
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-slate-800 bg-white/40 ring-1 ring-white/60 hover:bg-white/55 transition"
                >
                  See what’s inside
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/70">
                    ↘
                  </span>
                </a>
              </motion.div>

              <motion.div
                className="mt-8 flex flex-wrap gap-2"
                {...fadeUp(0.3)}
                aria-label="Highlights"
              >
                <span className="landing-pill">
                  <Sparkles className="h-4 w-4" /> AI tags
                </span>
                <span className="landing-pill">
                  <Star className="h-4 w-4" /> Favorites + collections
                </span>
                <span className="landing-pill">
                  <FileText className="h-4 w-4" /> PDFs + text capture
                </span>
              </motion.div>
            </div>

            {/* Right: app preview collage */}
            <motion.div
              className="relative"
              initial={reduce ? undefined : { opacity: 0, y: 10 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
            >
              <div className="landing-preview-wrap">
                <div className="landing-preview-top">
                  <div className="flex items-center gap-2">
                    <span className="dot bg-rose-400" />
                    <span className="dot bg-amber-400" />
                    <span className="dot bg-emerald-400" />
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-xs text-slate-600">
                    <span className="px-2 py-1 rounded-md bg-white/60 ring-1 ring-black/5">
                      /app
                    </span>
                    <span className="px-2 py-1 rounded-md bg-white/60 ring-1 ring-black/5">
                      #url-collector
                    </span>
                  </div>
                </div>

                <div className="landing-preview-body">
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-5">
                      <div className="landing-mini-card">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                          <LinkIcon className="h-4 w-4" /> URL Collector
                        </div>
                        <div className="mt-2 landing-skeleton h-8" />
                        <div className="mt-2 landing-skeleton h-8" />
                        <div className="mt-3 landing-skeleton h-6 w-2/3" />
                      </div>
                      <div className="mt-3 landing-mini-card">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                            <Sparkles className="h-4 w-4" /> Saved URLs
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Tagged
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="landing-chip">policy</div>
                          <div className="landing-chip">health</div>
                          <div className="landing-chip">method</div>
                          <div className="landing-chip">dataset</div>
                        </div>
                        <div className="mt-3 landing-skeleton h-16" />
                      </div>
                    </div>

                    <div className="col-span-7">
                      <div className="landing-mini-card h-full">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                            <BookOpen className="h-4 w-4" /> Notebook
                          </div>
                          <span className="text-[11px] text-slate-500">
                            Live sources
                          </span>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="landing-line w-11/12" />
                          <div className="landing-line w-9/12" />
                          <div className="landing-line w-10/12" />
                          <div className="landing-line w-7/12" />
                        </div>
                        <div className="mt-4 landing-skeleton h-28" />
                        <div className="mt-3 flex gap-2">
                          <div className="landing-pill-mini">Summary</div>
                          <div className="landing-pill-mini">Outline</div>
                          <div className="landing-pill-mini">Export</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================
   Features = your pages
   ======================== */
type Feature = {
  key: "url-collector" | "saved-urls" | "file-manager" | "notebook";
  title: string;
  icon: React.ReactNode;
  description: string;
  bullets: string[];
};

const FEATURES: Feature[] = [
  {
    key: "url-collector",
    title: "URL Collector",
    icon: <LinkIcon className="h-5 w-5" />,
    description:
      "Search, collect, dedupe, and batch-save sources — built for fast literature sweeps and competitive research.",
    bullets: [
      "Site + keyword search, paginated fetch, and quick selection",
      "Bulk save with safety rails (rate limits, aborts, restore state)",
      "Export-ready list: clean titles, domains, and tags",
    ],
  },
  {
    key: "saved-urls",
    title: "Saved URLs",
    icon: <Sparkles className="h-5 w-5" />,
    description:
      "Auto-tagging, smart filtering, and bulk actions — your sources stay tidy as the list grows.",
    bullets: [
      "AI tags + retry flow, favorites, and collections",
      "Capture text/PDF snapshots for offline reading",
      "Bulk move/copy/cut, dedupe, and quick search",
    ],
  },
  {
    key: "file-manager",
    title: "File Manager",
    icon: <FolderOpen className="h-5 w-5" />,
    description:
      "Upload, preview, and organize files with a clean explorer-style UX and lightning-fast scanability.",
    bullets: [
      "Folders, versions, visibility, and metadata",
      "Previews + search-ready structure",
      "Built for PDFs, datasets, and research assets",
    ],
  },
  {
    key: "notebook",
    title: "Notebook",
    icon: <BookOpen className="h-5 w-5" />,
    description:
      "Synthesize sources into briefs, outlines, and deliverables — with attached URLs/files as live context.",
    bullets: [
      "Attach sources to every notebook (URLs + files)",
      "AI-assisted outline/summary blocks and structured notes",
      "A single place to produce policy-ready writing from your own archive",
    ],
  },
];

function FeatureGrid() {
  return (
    <section
      id="features"
      className="relative mx-auto max-w-7xl px-6 py-20 md:py-24"
    >
      <div className="mx-auto max-w-2xl text-center">
        <motion.h2
          className="text-3xl font-bold tracking-tight md:text-4xl"
          {...fadeUp(0)}
        >
          Everything you need for archive analysis.
        </motion.h2>
        <motion.p className="mt-3 text-slate-600" {...fadeUp(0.08)}>
          Four pages, one workflow — designed to feel like a premium research
          tool, not a dashboard.
        </motion.p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
        {FEATURES.map((f, i) => (
          <motion.a
            key={f.key}
            href={`/app#${f.key}`}
            className="landing-card group"
            {...fadeUp(0.06 + i * 0.05)}
          >
            <div className="landing-card-top">
              <div className="landing-icon">{f.icon}</div>
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900 truncate">
                    {f.title}
                  </h3>
                  <span className="landing-card-cta">
                    Open <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{f.description}</p>
              </div>
            </div>

            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {f.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-gradient-to-br from-emerald-500 to-sky-500" />
                  <span className="flex-1">{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 landing-card-footer">
              <span className="landing-tag">/app</span>
              <span className="landing-tag">#{f.key}</span>
            </div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}

/* ========================
   Bottom CTA
   ======================== */
function BottomCTA() {
  return (
    <div className="landing-cta-bg">
      <div aria-hidden className="landing-noise" />
      <div className="mx-auto max-w-7xl px-6 py-16 md:py-20 text-center">
        <motion.h3
          className="text-2xl font-bold text-white md:text-3xl"
          {...fadeUp(0)}
        >
          Ready to make your research workflow look premium?
        </motion.h3>
        <motion.p className="mt-2 text-white/90" {...fadeUp(0.08)}>
          Open the workspace and start collecting sources in seconds.
        </motion.p>
      </div>
    </div>
  );
}

/* ========================
   Page
   ======================== */
export default function LandingPage() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Framer Motion's useScroll({ target }) measures against the page scroll root.
    // Make that root explicitly positioned to avoid its dev-time warning.
    root.classList.add("landing-scroll-root");
    body.classList.add("landing-scroll-root");

    return () => {
      root.classList.remove("landing-scroll-root");
      body.classList.remove("landing-scroll-root");
    };
  }, []);

  return (
    <main className="min-h-screen bg-white antialiased">
      <LandingNav />
      <div className="h-16" />
      <Hero />
      <FeatureGrid />
      <BottomCTA />
      <footer className="py-10 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="flex items-center gap-2">
              <img
                src="/assets/logo.png"
                alt="Smart Scrape"
                className="h-6 w-6 rounded-lg ring-1 ring-black/5"
              />
              <span className="font-semibold text-slate-700">Smart Scrape</span>
            </div>
            <div>© {new Date().getFullYear()} — built with care.</div>
          </div>
        </div>
      </footer>
    </main>
  );
}
