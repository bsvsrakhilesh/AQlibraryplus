import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Database,
  FileCheck2,
  FileSearch,
  FolderOpen,
  Menu,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import "./landing/landing.css";

type Surface = {
  id: string;
  label: string;
  shortLabel: string;
  purpose: string;
  actions: string;
  route: string;
  icon: typeof Search;
};

const surfaces: Surface[] = [
  {
    id: "collector",
    label: "URL Collector",
    shortLabel: "Discover",
    purpose: "Discover public sources",
    actions: "Define a research purpose, search, review coverage, and save relevant results.",
    route: "/app/url-collector",
    icon: Search,
  },
  {
    id: "registry",
    label: "Saved URLs",
    shortLabel: "Curate",
    purpose: "Curate the source registry",
    actions: "Filter, tag, group, review, and create durable Text or PDF captures.",
    route: "/app/saved-urls",
    icon: Database,
  },
  {
    id: "files",
    label: "File Manager",
    shortLabel: "Preserve",
    purpose: "Preserve durable evidence",
    actions: "Upload, organise, search, preview, inspect provenance, and restore files.",
    route: "/app/file-manager",
    icon: FolderOpen,
  },
  {
    id: "governance",
    label: "Governance Workspace",
    shortLabel: "Investigate",
    purpose: "Investigate governance questions",
    actions: "Retrieve official evidence, trace agencies and timelines, and inspect contradictions.",
    route: "/app/governance-workspace",
    icon: Network,
  },
  {
    id: "notebook",
    label: "Notebook",
    shortLabel: "Analyse",
    purpose: "Analyse selected sources",
    actions: "Control retrieval scope, ask focused questions, inspect citations, and write notes.",
    route: "/notebook",
    icon: BookOpen,
  },
];

const workflow = [
  { number: "01", title: "Define the purpose", body: "Record the question, jurisdiction, intended output, actors, and preferred sources.", icon: FileSearch },
  { number: "02", title: "Discover and review", body: "Search public sources, inspect results, remove duplicates, and review evidence coverage.", icon: Search },
  { number: "03", title: "Preserve the evidence", body: "Create durable Text or PDF captures so critical records do not remain only as links.", icon: FileCheck2 },
  { number: "04", title: "Analyse in context", body: "Use selected evidence to investigate agencies, timelines, decisions, and policy questions.", icon: Network },
  { number: "05", title: "Verify every claim", body: "Open material citations and compare each generated claim with the retrieved source passage.", icon: ShieldCheck },
];

const safetyChecks = [
  "The cited passage supports the associated claim.",
  "The source is authoritative, authentic, current, and applicable.",
  "Dates, units, amendments, negation, and conflicting evidence are interpreted correctly.",
  "The retrieval scope includes the relevant sources and periods.",
  "Source text is distinguished from model synthesis or inference.",
  "A qualified human reviews the conclusion before reliance.",
];

function Brand() {
  return (
    <span className="ssl-brand">
      <span className="ssl-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32"><path d="M7 20.5C8.7 10.7 15.3 6.4 25.6 7.2c-.8 10.5-6.1 17.4-17.3 18"/><path d="M8.5 24c4-5.4 8.3-8.9 15.3-13.1"/></svg>
      </span>
      <span><strong>Smart Scrape</strong><small>Evidence workspace</small></span>
    </span>
  );
}

function Header() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <header className="ssl-header">
      <div className="ssl-container ssl-header__inner">
        <button className="ssl-header__brand" onClick={() => goTo("home")} aria-label="Smart Scrape home"><Brand /></button>
        <nav className="ssl-header__nav" aria-label="Landing page navigation">
          <button onClick={() => goTo("workflow")}>How it works</button>
          <button onClick={() => goTo("workspaces")}>Workspaces</button>
          <button onClick={() => goTo("governance")}>Governance</button>
          <button onClick={() => goTo("safety")}>Evidence safety</button>
        </nav>
        <div className="ssl-header__actions">
          <button className="ssl-btn ssl-btn--quiet ssl-hide-mobile" onClick={() => navigate("/notebook")}><BookOpen /> Open Notebook</button>
          <button className="ssl-btn ssl-btn--primary" onClick={() => navigate("/app/url-collector")}>Open App <ArrowRight /></button>
          <button ref={menuButton} className="ssl-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="ssl-mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
      {menuOpen && (
        <nav id="ssl-mobile-menu" className="ssl-mobile-menu" aria-label="Mobile navigation">
          <button onClick={() => goTo("workflow")}>How it works</button>
          <button onClick={() => goTo("workspaces")}>Workspaces</button>
          <button onClick={() => goTo("governance")}>Governance</button>
          <button onClick={() => goTo("safety")}>Evidence safety</button>
          <button onClick={() => navigate("/notebook")}>Open Notebook</button>
        </nav>
      )}
    </header>
  );
}

function HeroVisual() {
  return (
    <div className="ssl-hero-visual" aria-label="Illustration of the Smart Scrape evidence workflow">
      <div className="ssl-purpose-card">
        <span className="ssl-mini-label">ACTIVE RESEARCH PURPOSE</span>
        <strong>Construction-dust enforcement</strong>
        <p>Delhi · 2023–2025 · Agency action review</p>
        <div><span>Jurisdiction defined</span><Check /></div>
      </div>
      <div className="ssl-flow-line ssl-flow-line--one" aria-hidden="true" />
      <div className="ssl-source-stack">
        <article><span>OFFICIAL ORDER</span><strong>CAQM direction</strong><small>PDF captured</small></article>
        <article><span>AGENCY RECORD</span><strong>Enforcement update</strong><small>Text captured</small></article>
        <article><span>MONITORING DATA</span><strong>Compliance report</strong><small>File indexed</small></article>
      </div>
      <div className="ssl-flow-line ssl-flow-line--two" aria-hidden="true" />
      <div className="ssl-answer-card">
        <div><Sparkles /><span>GROUNDED ANSWER</span><span className="ssl-status-dot" /></div>
        <p>“The included evidence records three enforcement actions during the selected period.”</p>
        <footer><span><sup>1</sup> CAQM direction</span><span><sup>2</sup> Agency update</span><strong>2 citations</strong></footer>
      </div>
      <div className="ssl-visual-caption"><span /> Illustrative workflow · no live analysis</div>
    </div>
  );
}

function Hero() {
  const navigate = useNavigate();
  return (
    <section id="home" className="ssl-hero">
      <div className="ssl-container ssl-hero__grid">
        <div className="ssl-hero__copy">
          <div className="ssl-eyebrow"><span>Research infrastructure</span><span>For governance and policy work</span></div>
          <h1>Build an evidence trail that survives scrutiny.</h1>
          <p>Smart Scrape helps teams collect, organise, preserve, and analyse fragmented public records—then trace cited findings back to the evidence.</p>
          <div className="ssl-hero__actions">
            <button className="ssl-btn ssl-btn--primary ssl-btn--large" onClick={() => navigate("/app/url-collector")}>Start with URL Collector <ArrowRight /></button>
            <button className="ssl-btn ssl-btn--secondary ssl-btn--large" onClick={() => document.getElementById("workflow")?.scrollIntoView({ behavior: "smooth" })}>Explore the workflow <ChevronDown /></button>
          </div>
          <div className="ssl-hero__note"><ShieldCheck /><span><strong>Evidence first.</strong> Retrieval and citations improve traceability; a qualified human still verifies the conclusion.</span></div>
        </div>
        <HeroVisual />
      </div>
      <div className="ssl-container ssl-hero__audience">
        <span>Built for evidence-intensive work</span>
        <div><strong>Public agencies</strong><strong>Environmental governance teams</strong><strong>Policy analysts</strong><strong>Research organisations</strong></div>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section id="workflow" className="ssl-section ssl-workflow">
      <div className="ssl-container">
        <div className="ssl-section-heading ssl-section-heading--split">
          <div><span className="ssl-kicker">A traceable research flow</span><h2>From research purpose to verified finding.</h2></div>
          <p>The system keeps the question, evidence, institutional context, and final analysis connected throughout the workflow.</p>
        </div>
        <div className="ssl-workflow-grid">
          {workflow.map((item) => {
            const Icon = item.icon;
            return <article key={item.number}><div><span>{item.number}</span><Icon /></div><h3>{item.title}</h3><p>{item.body}</p></article>;
          })}
        </div>
      </div>
    </section>
  );
}

const previewRows: Record<string, string[]> = {
  collector: ["CAQM direction on dust control", "CPCB construction monitoring", "DPCC enforcement update"],
  registry: ["CAQM Direction No. 76", "Construction dust action plan", "Agency compliance report"],
  files: ["Orders and directions", "Monitoring reports", "Enforcement records"],
  governance: ["Agency responsibility", "Action timeline", "Contradiction review"],
  notebook: ["Included sources", "Grounded answer", "Verified notes"],
};

function ProductPreview({ surface }: { surface: Surface }) {
  const labels: Record<string, [string, string, string]> = {
    collector: ["Research purpose", "Coverage check", "Save to purpose"],
    registry: ["Source registry", "Review state", "Create capture"],
    files: ["All evidence", "Evidence inspector", "Notebook ready"],
    governance: ["Question builder", "Retrieved evidence", "Generate answer"],
    notebook: ["Sources", "Chat", "Notes"],
  };
  const [sideLabel, topLabel, actionLabel] = labels[surface.id];
  return (
    <div className={`ssl-product-mock ssl-product-mock--${surface.id}`} aria-label={`${surface.label} interface illustration`}>
      <aside><div className="ssl-mock-logo"><span /><strong>Smart Scrape</strong></div><small>WORKSPACE</small>{[sideLabel, "Saved views", "Recent activity"].map((item, index) => <span key={item} className={index === 0 ? "is-active" : ""}>{item}</span>)}</aside>
      <div className="ssl-mock-main">
        <header><div><small>{surface.shortLabel.toUpperCase()}</small><strong>{surface.label}</strong></div><button>{actionLabel}</button></header>
        <div className="ssl-mock-summary"><span>{topLabel}</span><strong>{surface.purpose}</strong><p>{surface.actions}</p></div>
        <div className="ssl-mock-list">{previewRows[surface.id].map((row, index) => <article key={row}><span className="ssl-mock-file"><FileCheck2 /></span><div><strong>{row}</strong><small>{index === 0 ? "Official source" : index === 1 ? "Evidence record" : "Reviewed item"}</small></div><span className={index < 2 ? "is-ready" : ""}>{index < 2 ? "Ready" : "Review"}</span></article>)}</div>
      </div>
    </div>
  );
}

function Workspaces() {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState(surfaces[0].id);
  const active = surfaces.find((surface) => surface.id === activeId) ?? surfaces[0];
  return (
    <section id="workspaces" className="ssl-section ssl-workspaces">
      <div className="ssl-container">
        <div className="ssl-section-heading ssl-section-heading--center"><span className="ssl-kicker">Five connected work surfaces</span><h2>One workspace for the complete evidence lifecycle.</h2><p>Opening a page does not create, save, capture, or analyse evidence. Those actions happen inside the relevant work surface.</p></div>
        <div className="ssl-surface-tabs" role="tablist" aria-label="Smart Scrape work surfaces">
          {surfaces.map((surface) => {
            const Icon = surface.icon;
            return <button key={surface.id} role="tab" aria-selected={activeId === surface.id} aria-controls="ssl-surface-panel" className={activeId === surface.id ? "is-active" : ""} onClick={() => setActiveId(surface.id)}><Icon /><span><strong>{surface.label}</strong><small>{surface.shortLabel}</small></span></button>;
          })}
        </div>
        <div id="ssl-surface-panel" className="ssl-surface-panel" role="tabpanel">
          <div className="ssl-surface-panel__copy"><span className="ssl-kicker">{active.shortLabel}</span><h3>{active.purpose}</h3><p>{active.actions}</p><button className="ssl-inline-link" onClick={() => navigate(active.route)}>Open {active.label}<ArrowRight /></button></div>
          <div className="ssl-product-frame"><div className="ssl-product-frame__bar"><span /><span /><span /><small>Smart Scrape / {active.label}</small></div><ProductPreview surface={active} /></div>
        </div>
      </div>
    </section>
  );
}

function Governance() {
  const navigate = useNavigate();
  return (
    <section id="governance" className="ssl-section ssl-governance">
      <div className="ssl-container ssl-governance__grid">
        <div className="ssl-governance__copy"><span className="ssl-kicker">Governance analysis</span><h2>Investigate what happened, who acted, and what remains unresolved.</h2><p>Governance Workspace retrieves evidence before answer generation. Analysts review candidate sources, coverage, gaps, provenance, and excerpts before producing an evidence-backed answer.</p><ul><li><Check />Agency responsibility and action review</li><li><Check />Timelines, compliance, and follow-up</li><li><Check />Contradiction and order comparison</li><li><Check />Citations, quality status, and investigation history</li></ul><button className="ssl-btn ssl-btn--primary" onClick={() => navigate("/app/governance-workspace")}>Open Governance Workspace <ArrowRight /></button></div>
        <div className="ssl-governance__visual">
          <div className="ssl-question-card"><span className="ssl-mini-label">INVESTIGATION QUESTION</span><strong>Which agencies acted on construction-dust enforcement between 2023 and 2025?</strong><div><span>Agency responsibility</span><span>Delhi</span><span>2023–2025</span></div></div>
          <div className="ssl-evidence-list"><header><span>RETRIEVED EVIDENCE</span><strong>3 candidates</strong></header>{["CAQM Direction No. 76", "DPCC enforcement report", "CPCB monitoring summary"].map((item, index) => <article key={item}><span>0{index + 1}</span><div><strong>{item}</strong><small>{index === 0 ? "Official order" : index === 1 ? "Agency report" : "Monitoring data"}</small></div><span className={index < 2 ? "is-included" : ""}>{index < 2 ? "Included" : "Review"}</span></article>)}</div>
        </div>
      </div>
    </section>
  );
}

function Safety() {
  return (
    <section id="safety" className="ssl-section ssl-safety">
      <div className="ssl-container ssl-safety__grid">
        <div><span className="ssl-kicker">Evidence and AI safety</span><h2>A citation is an evidence pointer—not a guarantee.</h2><p>Before using an answer for policy, legal, compliance, enforcement, procurement, or operational decisions, verify the evidence and the interpretation.</p><div className="ssl-safety-badge"><ShieldCheck /><span><strong>Human review remains required</strong><small>Generated findings must be checked against cited evidence.</small></span></div></div>
        <div className="ssl-checklist">{safetyChecks.map((item, index) => <article key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p><Check /></article>)}</div>
      </div>
    </section>
  );
}

function FinalCta() {
  const navigate = useNavigate();
  return (
    <section className="ssl-final"><div className="ssl-container ssl-final__inner"><div><span className="ssl-kicker">Start a new investigation</span><h2>Collect the source. Preserve the record. Verify the answer.</h2></div><div><p>Begin in URL Collector when you need to discover evidence. Open Notebook when the required sources are already in the archive.</p><div><button className="ssl-btn ssl-btn--primary ssl-btn--large" onClick={() => navigate("/app/url-collector")}>Open App <ArrowRight /></button><button className="ssl-btn ssl-btn--secondary ssl-btn--large" onClick={() => navigate("/notebook")}><BookOpen /> Open Notebook</button></div></div></div></section>
  );
}

function Footer() {
  return <footer className="ssl-footer"><div className="ssl-container ssl-footer__inner"><Brand /><p>Research infrastructure for traceable, citation-backed governance evidence.</p><nav aria-label="Footer navigation"><a href="#workflow">How it works</a><a href="#workspaces">Workspaces</a><a href="#safety">Evidence safety</a><a href="mailto:hello@smartscrape.local">Contact</a></nav><small>© {new Date().getFullYear()} Smart Scrape</small></div></footer>;
}

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.classList.add("landing-scroll-root");
    document.body.classList.add("landing-scroll-root");
    document.title = "Smart Scrape | Traceable Evidence for Governance";
    return () => {
      document.documentElement.classList.remove("landing-scroll-root");
      document.body.classList.remove("landing-scroll-root");
    };
  }, []);

  return <main className="ssl-page"><a href="#home" className="ssl-skip">Skip to content</a><Header /><Hero /><Workflow /><Workspaces /><Governance /><Safety /><FinalCta /><Footer /></main>;
}
