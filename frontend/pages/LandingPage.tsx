import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileSearch,
  FolderOpen,
  Gauge,
  Layers3,
  Menu,
  MessageSquare,
  Network,
  Search,
  ShieldCheck,
  Waypoints,
  X,
  type LucideIcon,
} from "lucide-react";
import "./landing/landing.css";

type SurfaceId = "collector" | "registry" | "files" | "governance" | "notebook";

type Surface = {
  id: SurfaceId;
  label: string;
  shortLabel: string;
  purpose: string;
  actions: string;
  route: string;
  icon: LucideIcon;
  stat: string;
  detail: string;
};

type WorkflowItem = {
  number: string;
  title: string;
  body: string;
  icon: LucideIcon;
};

const surfaces: Surface[] = [
  {
    id: "collector",
    label: "URL Collector",
    shortLabel: "Discover",
    purpose: "Find the right public records",
    actions: "Describe what you are looking for, search trusted sources, and keep the results worth reviewing.",
    route: "/app/url-collector",
    icon: Search,
    stat: "8 trusted sources checked",
    detail: "Purpose, search scope, official-source coverage, and results stay in one focused workspace.",
  },
  {
    id: "registry",
    label: "Saved URLs",
    shortLabel: "Curate",
    purpose: "Keep useful links organized",
    actions: "Review saved links, add notes and tags, group records, and capture important pages before they change.",
    route: "/app/saved-urls",
    icon: Database,
    stat: "50 records per review queue",
    detail: "Queues, saved searches, capture status, tags, and source rows are designed for repeated review.",
  },
  {
    id: "files",
    label: "File Manager",
    shortLabel: "Preserve",
    purpose: "Store the records that matter",
    actions: "Upload reports, sort files into folders, inspect documents, and recover older versions when needed.",
    route: "/app/file-manager",
    icon: FolderOpen,
    stat: "PDFs, captures, reports",
    detail: "A document archive with filters, analyst views, tags, and evidence inspection.",
  },
  {
    id: "governance",
    label: "Governance Workspace",
    shortLabel: "Investigate",
    purpose: "Understand what happened",
    actions: "Compare official records, follow agency actions, build timelines, and spot gaps in the story.",
    route: "/app/governance-workspace",
    icon: Network,
    stat: "Agencies, orders, gaps",
    detail: "Turn a public question into a reviewable set of records, dates, actors, and findings.",
  },
  {
    id: "notebook",
    label: "Notebook",
    shortLabel: "Analyse",
    purpose: "Turn records into notes",
    actions: "Ask questions about selected sources, check cited passages, and write up what the records show.",
    route: "/notebook",
    icon: BookOpen,
    stat: "Sources, answer, notes",
    detail: "A focused reading and writing space where source material stays next to the draft answer.",
  },
];

const workflow: WorkflowItem[] = [
  {
    number: "01",
    title: "Start with the question",
    body: "Write down what you need to know, where it applies, and which sources you trust.",
    icon: FileSearch,
  },
  {
    number: "02",
    title: "Find the records",
    body: "Search focused sources, compare what you found, and notice when key records are missing.",
    icon: Gauge,
  },
  {
    number: "03",
    title: "Save a reliable copy",
    body: "Keep important pages and files so your work does not depend on a link staying live.",
    icon: Archive,
  },
  {
    number: "04",
    title: "Follow the story",
    body: "See which agencies acted, what changed over time, and where records disagree.",
    icon: Waypoints,
  },
  {
    number: "05",
    title: "Check every answer",
    body: "Open the cited source, read the passage yourself, and confirm the conclusion is fair.",
    icon: ClipboardCheck,
  },
];

const safetyChecks = [
  "The cited passage really supports the point being made.",
  "The source is official, current, and relevant to the question.",
  "Dates, numbers, amendments, and exceptions have been read carefully.",
  "The review includes the right sources and time period.",
  "The original source text is easy to separate from AI help.",
  "A qualified person reviews the conclusion before it is used.",
];

function Brand() {
  return (
    <span className="ssl-brand">
      <span className="ssl-brand__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path d="M7 20.5C8.7 10.7 15.3 6.4 25.6 7.2c-.8 10.5-6.1 17.4-17.3 18" />
          <path d="M8.5 24c4-5.4 8.3-8.9 15.3-13.1" />
        </svg>
      </span>
      <span>
        <strong>AQlibrary+</strong>
        <small>Research workspace</small>
      </span>
    </span>
  );
}

function Header() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [scrollProgress, setScrollProgress] = useState(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const navItems = [
    { id: "workflow", label: "Workflow" },
    { id: "workspaces", label: "Workspace" },
    { id: "governance", label: "Governance" },
    { id: "safety", label: "Safety" },
  ];

  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  useEffect(() => {
    let raf = 0;
    const sectionIds = ["home", ...navItems.map((item) => item.id)];

    const updateHeaderState = () => {
      const y = window.scrollY;
      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      setScrolled(y > 24);
      setScrollProgress(Math.min(1, Math.max(0, y / maxScroll)));

      const current =
        sectionIds
          .map((id) => ({
            id,
            top: Math.abs((document.getElementById(id)?.getBoundingClientRect().top ?? 9999) - 96),
            passed: (document.getElementById(id)?.getBoundingClientRect().top ?? 9999) <= 120,
          }))
          .filter((item) => item.passed)
          .sort((a, b) => a.top - b.top)[0]?.id ?? "home";

      setActiveSection(current);
    };

    const onScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(updateHeaderState);
    };

    updateHeaderState();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

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
    <header className={`ssl-header ${scrolled ? "is-scrolled" : ""}`}>
      <div
        className="ssl-header__progress"
        style={{ transform: `scaleX(${scrollProgress})` }}
        aria-hidden="true"
      />
      <div className="ssl-container ssl-header__inner">
        <button
          className="ssl-header__brand"
          onClick={() => goTo("home")}
          aria-label="AQlibrary+ home"
        >
          <Brand />
        </button>
        <nav className="ssl-header__nav" aria-label="Landing page navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? "is-active" : ""}
              onClick={() => goTo(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="ssl-header__actions">
          <button
            className="ssl-notebook-cta ssl-hide-mobile"
            onClick={() => navigate("/notebook")}
          >
            <span className="ssl-notebook-cta__icon" aria-hidden="true">
              <BookOpen />
            </span>
            <span>Open Notebook</span>
          </button>
          <button className="ssl-btn ssl-btn--primary" onClick={() => navigate("/app/url-collector")}>
            Open App <ArrowRight />
          </button>
          <button
            ref={menuButton}
            className="ssl-menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="ssl-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav id="ssl-mobile-menu" className="ssl-mobile-menu" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={activeSection === item.id ? "is-active" : ""}
              onClick={() => goTo(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button onClick={() => navigate("/notebook")}>Open Notebook</button>
        </nav>
      )}
    </header>
  );
}

function CollectorMock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ssl-mock ssl-mock--collector ${compact ? "ssl-mock--compact" : ""}`} aria-label="URL Collector interface">
      <aside className="ssl-mock__rail">
        <span className="is-active" />
        <span />
        <span />
        <span />
      </aside>
      <section className="ssl-mock__main">
        <header className="ssl-mock__top">
          <div>
            <span>{compact ? "Research Workspace" : "URL Collector"}</span>
            <strong>Construction dust enforcement review</strong>
          </div>
          <button>{compact ? "Save review" : "Save results"}</button>
        </header>
        <div className="ssl-purpose-pane">
          <div>
            <span>Research brief</span>
            <strong>Which public records support recent enforcement action?</strong>
            <small>Delhi NCR | 2023-2025 | Official sources preferred</small>
          </div>
          <div className="ssl-source-score">
            <strong>82%</strong>
            <span>{compact ? "review coverage" : "source coverage"}</span>
          </div>
        </div>
        <div className="ssl-search-row">
          <span>site: caqm.nic.in</span>
          <span>dust control direction</span>
          <button>Search</button>
        </div>
        <div className="ssl-result-list">
          {["CAQM Direction No. 76", "DPCC enforcement update", "Construction dust action plan"].map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{item}</strong>
                <small>{index === 0 ? "Official order" : index === 1 ? "Agency update" : "Action plan"}</small>
              </div>
              <em>{index < 2 ? "Ready" : "Review"}</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function RegistryMock() {
  return (
    <div className="ssl-mock ssl-mock--registry" aria-label="Saved URLs interface">
      <aside className="ssl-mock-sidebar">
        <strong>Collections</strong>
        <span className="is-active">Air quality orders</span>
        <span>Monitoring reports</span>
        <span>Agency updates</span>
      </aside>
      <section className="ssl-mock__main">
        <header className="ssl-mock__top">
          <div>
            <span>Saved URLs</span>
            <strong>Review queue</strong>
          </div>
          <button>Capture page</button>
        </header>
        <div className="ssl-queue-row">
          <span>All 128</span>
          <span>Needs capture 14</span>
          <span>Updated 7</span>
        </div>
        <div className="ssl-registry-table">
          {["Official order", "Agency report", "Court direction", "Monitoring summary"].map((row, index) => (
            <article key={row}>
              <span />
              <strong>{row}</strong>
              <small>{index % 2 === 0 ? "caqm.nic.in" : "dpcc.delhi.gov.in"}</small>
              <em>{index === 1 ? "Capture" : "Saved"}</em>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function FilesMock() {
  return (
    <div className="ssl-mock ssl-mock--files" aria-label="File Manager interface">
      <aside className="ssl-mock-sidebar">
        <strong>Archive</strong>
        <span className="is-active">All evidence</span>
        <span>Web captures</span>
        <span>Verified files</span>
      </aside>
      <section className="ssl-mock__main">
        <header className="ssl-mock__top">
          <div>
            <span>File Manager</span>
            <strong>Evidence archive</strong>
          </div>
          <button>Upload</button>
        </header>
        <div className="ssl-file-grid">
          {["Orders", "Reports", "Notices", "Review notes", "Source PDFs", "Captures"].map((item, index) => (
            <article key={item}>
              <FolderOpen />
              <strong>{item}</strong>
              <small>{index + 3} items</small>
            </article>
          ))}
        </div>
        <div className="ssl-inspector-strip">
          <span>Selected file</span>
          <strong>CAQM direction.pdf</strong>
          <em>Verified | Notebook ready</em>
        </div>
      </section>
    </div>
  );
}

function GovernanceMock() {
  return (
    <div className="ssl-mock ssl-mock--governance" aria-label="Governance Workspace interface">
      <section className="ssl-mock__main">
        <header className="ssl-mock__top">
          <div>
            <span>Governance Workspace</span>
            <strong>Agency action review</strong>
          </div>
          <button>Build answer</button>
        </header>
        <div className="ssl-question-builder">
          <span>Question</span>
          <strong>Which agencies acted on construction dust enforcement between 2023 and 2025?</strong>
          <div>
            <em>Agency responsibility</em>
            <em>Timeline</em>
            <em>Contradictions</em>
          </div>
        </div>
        <div className="ssl-governance-lanes">
          <article>
            <span>01</span>
            <strong>CAQM direction</strong>
            <small>Official order</small>
          </article>
          <article>
            <span>02</span>
            <strong>DPCC follow-up</strong>
            <small>Agency update</small>
          </article>
          <article>
            <span>03</span>
            <strong>CPCB monitoring</strong>
            <small>Review gap</small>
          </article>
        </div>
      </section>
    </div>
  );
}

function NotebookMock() {
  return (
    <div className="ssl-mock ssl-mock--notebook" aria-label="Notebook interface">
      <aside className="ssl-notebook-sources">
        <strong>Sources</strong>
        <span className="is-active">CAQM direction</span>
        <span>DPCC report</span>
        <span>Monitoring note</span>
      </aside>
      <section className="ssl-notebook-chat">
        <span>Answer</span>
        <p>Three records show agency action during the review period. Two need a human check before use.</p>
        <div><sup>1</sup> CAQM direction</div>
      </section>
      <aside className="ssl-notebook-notes">
        <strong>Notes</strong>
        <span>Summary</span>
        <span>Open checks</span>
      </aside>
    </div>
  );
}

function ProductMockup({ surface }: { surface: Surface }) {
  switch (surface.id) {
    case "registry":
      return <RegistryMock />;
    case "files":
      return <FilesMock />;
    case "governance":
      return <GovernanceMock />;
    case "notebook":
      return <NotebookMock />;
    default:
      return <CollectorMock />;
  }
}

function HeroVisual() {
  return (
    <div className="ssl-hero-visual" aria-label="AQlibrary+ workspace overview">
      <div className="ssl-hero-visual__backdrop" aria-hidden="true" />
      <div className="ssl-hero-visual__masthead">
        <div>
          <span>Workspace flow</span>
          <strong>One review, every step connected</strong>
        </div>
        <div aria-label="Workflow stages">
          <span>Collect</span>
          <span>Organize</span>
          <span>Analyse</span>
          <span>Explain</span>
        </div>
      </div>
      <CollectorMock compact />
      <div className="ssl-hero-summary" aria-label="AQlibrary+ workflow summary">
        <article>
          <FileSearch />
          <span>Find and preserve</span>
          <strong>Searches, saved pages, and files stay attached to the review.</strong>
        </article>
        <article>
          <Waypoints />
          <span>Build the context</span>
          <strong>Agencies, dates, gaps, and notes become easier to compare.</strong>
        </article>
        <article>
          <ClipboardCheck />
          <span>Write with checks</span>
          <strong>Answers stay close to the records that support them.</strong>
        </article>
      </div>
    </div>
  );
}

function Hero() {
  const navigate = useNavigate();
  return (
    <section id="home" className="ssl-hero">
      <div className="ssl-container ssl-hero__grid">
        <div className="ssl-hero__copy" data-reveal>
          <div className="ssl-eyebrow">
            <span>For serious research</span>
            <span>Built for public records and policy work</span>
          </div>
          <h1>Find the source. Keep the proof. Explain what happened.</h1>
          <p>
            AQlibrary+ gives research teams a calmer way to move through public records:
            gather the trail, preserve what matters, and write answers that still hold up when
            someone asks, "where did this come from?"
          </p>
          <div className="ssl-hero__actions">
            <button className="ssl-btn ssl-btn--primary ssl-btn--large" onClick={() => navigate("/app/url-collector")}>
              Start a review <ArrowRight />
            </button>
            <button
              className="ssl-btn ssl-btn--secondary ssl-btn--large"
              onClick={() => document.getElementById("workspaces")?.scrollIntoView({ behavior: "smooth" })}
            >
              See the workspace <ChevronDown />
            </button>
          </div>
          <div className="ssl-hero__proof" aria-label="Product strengths">
            <span><ShieldCheck /> Checkable sources</span>
            <span><Layers3 /> Saved copies</span>
            <span><Brain /> AI help when useful</span>
          </div>
          <div className="ssl-hero__metrics" aria-label="Research workflow signals">
            <span><strong>01</strong> Search with intent</span>
            <span><strong>02</strong> Keep the original trail</span>
            <span><strong>03</strong> Write with receipts</span>
          </div>
        </div>
        <div data-reveal>
          <HeroVisual />
        </div>
      </div>
      <div className="ssl-container ssl-hero__audience" data-reveal>
        <span>Made for careful research</span>
        <div>
          <strong>Public agencies</strong>
          <strong>Environmental governance</strong>
          <strong>Policy analysts</strong>
          <strong>Research organisations</strong>
        </div>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section id="workflow" className="ssl-section ssl-workflow">
      <div className="ssl-container">
        <div className="ssl-section-heading ssl-section-heading--split" data-reveal>
          <div>
            <span className="ssl-kicker">A clear way to work</span>
            <h2>From first question to checked answer.</h2>
          </div>
        </div>
        <div className="ssl-workflow-grid" data-reveal>
          {workflow.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.number}>
                <div>
                  <span>{item.number}</span>
                  <Icon />
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Workspaces() {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<SurfaceId>("collector");
  const active = surfaces.find((surface) => surface.id === activeId) ?? surfaces[0];

  return (
    <section id="workspaces" className="ssl-section ssl-workspaces">
      <div className="ssl-container">
        <div className="ssl-section-heading ssl-section-heading--center" data-reveal>
          <span className="ssl-kicker">Five places to get work done</span>
          <h2>Everything you need to collect, organize, and explain records.</h2>
          <p>
            These views show the shape of the workspace without overwhelming the page:
            enough detail to understand how the app works before opening it.
          </p>
        </div>
        <div className="ssl-surface-tabs" role="tablist" aria-label="AQlibrary+ work surfaces" data-reveal>
          {surfaces.map((surface) => {
            const Icon = surface.icon;
            return (
              <button
                key={surface.id}
                role="tab"
                aria-selected={activeId === surface.id}
                aria-controls="ssl-surface-panel"
                className={activeId === surface.id ? "is-active" : ""}
                onClick={() => setActiveId(surface.id)}
              >
                <Icon />
                <span>
                  <strong>{surface.label}</strong>
                  <small>{surface.shortLabel}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div id="ssl-surface-panel" className="ssl-surface-panel" role="tabpanel" data-reveal>
          <div className="ssl-surface-panel__copy">
            <span className="ssl-kicker">{active.shortLabel}</span>
            <h3>{active.purpose}</h3>
            <p>{active.actions}</p>
            <div className="ssl-surface-stat">
              <strong>{active.stat}</strong>
              <span>{active.detail}</span>
            </div>
            <button className="ssl-inline-link" onClick={() => navigate(active.route)}>
              Open {active.label}<ArrowRight />
            </button>
          </div>
          <div className="ssl-product-stage">
            <ProductMockup surface={active} />
            <div className="ssl-product-stage__badge">
              <FileCheck2 />
              <span>Workspace overview</span>
            </div>
          </div>
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
        <div className="ssl-governance__copy" data-reveal>
          <span className="ssl-kicker">For governance questions</span>
          <h2>See who acted, what changed, and what still needs checking.</h2>
          <p>
            When the question involves agencies, orders, timelines, or public decisions, AQlibrary+
            helps you pull the relevant records together before drawing a conclusion.
          </p>
          <ul>
            <li><Check />Agency roles and actions</li>
            <li><Check />Timelines, follow-up, and compliance</li>
            <li><Check />Conflicting records and changing orders</li>
            <li><Check />Source links and review history</li>
          </ul>
          <button className="ssl-btn ssl-btn--primary" onClick={() => navigate("/app/governance-workspace")}>
            Open Governance Workspace <ArrowRight />
          </button>
        </div>
        <div className="ssl-governance__visual" data-reveal>
          <GovernanceMock />
          <div className="ssl-governance-strip">
            <span>Review packet</span>
            <strong>3 records ready</strong>
            <strong>2 items to verify</strong>
            <strong>1 open gap</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function Safety() {
  return (
    <section id="safety" className="ssl-section ssl-safety">
      <div className="ssl-container ssl-safety__grid">
        <div data-reveal>
          <span className="ssl-kicker">Use AI carefully</span>
          <h2>A source link helps you check an answer. It does not replace judgment.</h2>
          <p>
            Before using an answer for policy, legal, compliance, enforcement, procurement, or
            operational decisions, read the source and check the interpretation.
          </p>
          <div className="ssl-safety-badge">
            <ShieldCheck />
            <span>
              <strong>Human review is still required</strong>
              <small>AI can help organize the work, but people must verify it.</small>
            </span>
          </div>
        </div>
        <div className="ssl-checklist" data-reveal>
          {safetyChecks.map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{item}</p>
              <Check />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const navigate = useNavigate();
  return (
    <section className="ssl-final">
      <div className="ssl-container ssl-final__inner" data-reveal>
        <div>
          <span className="ssl-kicker">Start your next review</span>
          <h2>Collect the record. Keep a copy. Check the answer.</h2>
        </div>
        <div>
          <p>
            Start with search when you need to find records. Open the notebook when your sources
            are ready and you want to write up what they show.
          </p>
          <div>
            <button className="ssl-btn ssl-btn--primary ssl-btn--large" onClick={() => navigate("/app/url-collector")}>
              Open App <ArrowRight />
            </button>
            <button className="ssl-btn ssl-btn--secondary ssl-btn--large" onClick={() => navigate("/notebook")}>
              <MessageSquare /> Open Notebook
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="ssl-footer">
      <div className="ssl-container">
        <div className="ssl-footer__inner">
          <div className="ssl-footer__brand">
            <Brand />
            <p>A focused workspace for finding public records, saving proof, and writing answers that can be checked.</p>
            <div className="ssl-footer__signal">
              <ShieldCheck />
              <span>Built around source review, saved copies, and human judgment.</span>
            </div>
          </div>

          <nav className="ssl-footer__links" aria-label="Footer navigation">
            <div>
              <strong>Product</strong>
              <a href="#workflow">Workflow</a>
              <a href="#workspaces">Workspace</a>
              <a href="#governance">Governance</a>
              <a href="#safety">Safety</a>
            </div>
            <div>
              <strong>Workspaces</strong>
              <button type="button" onClick={() => window.location.assign("/app/url-collector")}>URL Collector</button>
              <button type="button" onClick={() => window.location.assign("/app/saved-urls")}>Saved URLs</button>
              <button type="button" onClick={() => window.location.assign("/app/file-manager")}>File Manager</button>
              <button type="button" onClick={() => window.location.assign("/notebook")}>Notebook</button>
            </div>
            <div>
              <strong>Contact</strong>
              <a href="mailto:hello@aqlibraryplus.local">hello@aqlibraryplus.local</a>
              <span>For research teams, policy analysts, and public-record review.</span>
            </div>
          </nav>
        </div>

        <div className="ssl-footer__bottom">
          <small>Copyright {new Date().getFullYear()} AQlibrary+</small>
          <span>Keep the record. Check the source. Use AI carefully.</span>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  useEffect(() => {
    document.documentElement.classList.add("landing-scroll-root");
    document.body.classList.add("landing-scroll-root");
    document.title = "AQlibrary+ | Public Records Research Workspace";

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
      return () => {
        document.documentElement.classList.remove("landing-scroll-root");
        document.body.classList.remove("landing-scroll-root");
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    revealNodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      document.documentElement.classList.remove("landing-scroll-root");
      document.body.classList.remove("landing-scroll-root");
    };
  }, []);

  return (
    <main className="ssl-page">
      <a href="#home" className="ssl-skip">Skip to content</a>
      <Header />
      <Hero />
      <Workflow />
      <Workspaces />
      <Governance />
      <Safety />
      <FinalCta />
      <Footer />
    </main>
  );
}
