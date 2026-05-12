// frontend/pages/LandingPage.tsx
import React, { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  motion,
  useReducedMotion,
  type MotionProps,
  type Transition,
} from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Database,
  FileText,
  FolderOpen,
  GitBranch,
  Link as LinkIcon,
  Network,
  Search,
  Tags,
} from "lucide-react";
import * as THREE from "three";

const EASE: Transition["ease"] = [0.16, 1, 0.3, 1];

const fadeUp = (delay = 0): MotionProps => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.62, ease: EASE, delay },
  viewport: { once: true, amount: 0.28 },
});

const heroFade = (delay = 0): MotionProps => ({
  initial: false,
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.62, ease: EASE, delay },
});

type RouteTarget =
  | "/app/url-collector"
  | "/app/saved-urls"
  | "/app/file-manager"
  | "/app/governance-workspace"
  | "/notebook";

type WorkflowStep = {
  id: string;
  title: string;
  verb: string;
  route: RouteTarget;
  icon: React.ReactNode;
  description: string;
  proof: string;
};

type PageInfo = {
  title: string;
  eyebrow: string;
  route: RouteTarget;
  icon: React.ReactNode;
  description: string;
  highlights: string[];
};

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "collect",
    title: "URL Collector",
    verb: "Collect",
    route: "/app/url-collector",
    icon: <Search className="h-5 w-5" />,
    description:
      "Run focused source sweeps, review candidates quickly, and save the pages worth keeping.",
    proof: "Search, dedupe, batch save",
  },
  {
    id: "enrich",
    title: "Saved URLs",
    verb: "Enrich",
    route: "/app/saved-urls",
    icon: <Tags className="h-5 w-5" />,
    description:
      "Turn the saved list into a structured source registry with tags, snapshots, filters, and review state.",
    proof: "AI tags, collections, snapshots",
  },
  {
    id: "organize",
    title: "File Manager",
    verb: "Organize",
    route: "/app/file-manager",
    icon: <FolderOpen className="h-5 w-5" />,
    description:
      "Add PDFs, datasets, and reference files beside your URLs so every artifact has a durable home.",
    proof: "Folders, previews, metadata",
  },
  {
    id: "map",
    title: "Governance Workspace",
    verb: "Map",
    route: "/app/governance-workspace",
    icon: <Network className="h-5 w-5" />,
    description:
      "Trace agencies, issues, evidence, and case relationships without losing the source beneath each claim.",
    proof: "Issue matrix, agency landscape",
  },
  {
    id: "synthesize",
    title: "Notebook",
    verb: "Synthesize",
    route: "/notebook",
    icon: <BookOpen className="h-5 w-5" />,
    description:
      "Draft briefs, outlines, and working notes from the archive you already organized.",
    proof: "Attached sources, grounded notes",
  },
];

const PAGE_DIRECTORY: PageInfo[] = [
  {
    title: "URL Collector",
    eyebrow: "Source intake",
    route: "/app/url-collector",
    icon: <LinkIcon className="h-5 w-5" />,
    description:
      "A fast capture surface for search-driven research, source discovery, and clean bulk saving.",
    highlights: ["Targeted source sweeps", "Candidate review", "Batch save flow"],
  },
  {
    title: "Saved URLs",
    eyebrow: "Source registry",
    route: "/app/saved-urls",
    icon: <Database className="h-5 w-5" />,
    description:
      "The control room for reviewing, tagging, searching, and preserving web sources as reusable evidence.",
    highlights: ["AI tagging", "Collections and filters", "Snapshots and review state"],
  },
  {
    title: "File Manager",
    eyebrow: "Evidence library",
    route: "/app/file-manager",
    icon: <FolderOpen className="h-5 w-5" />,
    description:
      "Explorer-grade organization for documents, uploads, metadata, and long-lived research assets.",
    highlights: ["Folders and versions", "Document previews", "Evidence inspector"],
  },
  {
    title: "Governance Workspace",
    eyebrow: "Relationship map",
    route: "/app/governance-workspace",
    icon: <GitBranch className="h-5 w-5" />,
    description:
      "A mapping surface for governance questions, agency relationships, issue timelines, and case evidence.",
    highlights: ["Agency landscape", "Issue matrix", "Evidence-linked findings"],
  },
  {
    title: "Notebook",
    eyebrow: "Synthesis studio",
    route: "/notebook",
    icon: <BookOpen className="h-5 w-5" />,
    description:
      "A writing workspace for turning selected sources into notes, outlines, summaries, and policy-ready drafts.",
    highlights: ["Source attachments", "Grounded summaries", "Reusable briefs"],
  },
];

const MagneticButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className = "", children, ...rest }) => {
  const ref = useRef<HTMLButtonElement>(null);

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    el.style.setProperty("--tx", `${mx * 0.1}px`);
    el.style.setProperty("--ty", `${my * 0.1}px`);
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

function createPanel(
  width: number,
  height: number,
  depth: number,
  color: number,
  accent: number,
) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.25,
      roughness: 0.35,
      transparent: true,
      opacity: 0.92,
    }),
  );
  group.add(body);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(body.geometry),
    new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.42,
    }),
  );
  group.add(edge);

  const header = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.78, height * 0.08, depth + 0.01),
    new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.82,
    }),
  );
  header.position.set(0, height * 0.28, depth * 0.58);
  group.add(header);

  return group;
}

function createChip(width: number, color: number) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.2, 0.08),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12,
      roughness: 0.42,
    }),
  );
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();

    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function StaticWorkflowMockup() {
  return (
    <div className="landing-static-workflow" aria-hidden="true">
      {WORKFLOW_STEPS.map((step, index) => (
        <div
          key={step.id}
          className="landing-static-node"
          style={{ "--i": index } as React.CSSProperties}
        >
          <span>{step.icon}</span>
          <strong>{step.verb}</strong>
        </div>
      ))}
      <div className="landing-static-panel landing-static-panel--left">
        <FileText className="h-4 w-4" />
        Sources
      </div>
      <div className="landing-static-panel landing-static-panel--right">
        <BookOpen className="h-4 w-4" />
        Notebook
      </div>
    </div>
  );
}

function WorkflowScene3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || !canvasRef.current) return undefined;

    const canvas = canvasRef.current;
    const host = canvas.parentElement;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.05, 8.4);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));

    const ambient = new THREE.AmbientLight(0xffffff, 1.7);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xdffcff, 2.2);
    keyLight.position.set(2.8, 4.2, 4.4);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x38bdf8, 35, 10);
    rimLight.position.set(-3.4, 2.2, 2.5);
    scene.add(rimLight);

    const root = new THREE.Group();
    scene.add(root);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.4, -0.45, 0),
      new THREE.Vector3(-1.8, 0.35, -0.45),
      new THREE.Vector3(-0.15, -0.1, 0.35),
      new THREE.Vector3(1.55, 0.45, -0.2),
      new THREE.Vector3(3.15, -0.18, 0.15),
    ]);

    const rail = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 96, 0.018, 8, false),
      new THREE.MeshStandardMaterial({
        color: 0x14b8a6,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.32,
        roughness: 0.2,
      }),
    );
    root.add(rail);

    const floating: THREE.Object3D[] = [];
    const addFloating = (
      object: THREE.Object3D,
      x: number,
      y: number,
      z: number,
      rotation: [number, number, number],
    ) => {
      object.position.set(x, y, z);
      object.rotation.set(...rotation);
      object.userData = {
        baseY: y,
        phase: floating.length * 0.72,
        speed: 0.75 + floating.length * 0.04,
      };
      floating.push(object);
      root.add(object);
    };

    addFloating(
      createPanel(1.0, 1.25, 0.05, 0xe2e8f0, 0x0ea5e9),
      -3.15,
      0.55,
      0.15,
      [-0.18, 0.48, -0.08],
    );
    addFloating(
      createPanel(0.92, 1.08, 0.05, 0xf8fafc, 0x10b981),
      -2.35,
      -0.58,
      -0.36,
      [0.18, 0.64, 0.08],
    );
    addFloating(
      createPanel(1.18, 0.78, 0.06, 0xdbeafe, 0x2563eb),
      -0.95,
      0.52,
      -0.55,
      [-0.08, -0.18, 0.03],
    );

    const chipGroup = new THREE.Group();
    [0x10b981, 0x0ea5e9, 0xf59e0b, 0x6366f1].forEach((color, index) => {
      const chip = createChip(0.64 + index * 0.04, color);
      chip.position.set(index * 0.18 - 0.28, index * 0.18 - 0.22, index * 0.08);
      chip.rotation.z = (index - 1.5) * 0.18;
      chipGroup.add(chip);
    });
    addFloating(chipGroup, -0.15, -0.42, 0.55, [0.14, -0.42, 0.04]);

    const folderGroup = new THREE.Group();
    const folderBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.08, 0.72, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.15,
        roughness: 0.36,
      }),
    );
    folderGroup.add(folderBase);
    const folderTab = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.16, 0.24),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.14,
      }),
    );
    folderTab.position.set(-0.26, 0.43, 0.01);
    folderGroup.add(folderTab);
    addFloating(folderGroup, 0.72, 0.34, -0.12, [-0.12, -0.68, -0.04]);

    const graphGroup = new THREE.Group();
    const graphPoints = [
      new THREE.Vector3(-0.48, -0.1, 0),
      new THREE.Vector3(0.08, 0.42, 0.12),
      new THREE.Vector3(0.52, 0.02, -0.1),
      new THREE.Vector3(0.22, -0.46, 0.1),
    ];
    const graphMaterial = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.22,
      roughness: 0.24,
    });
    graphPoints.forEach((point) => {
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), graphMaterial);
      node.position.copy(point);
      graphGroup.add(node);
    });
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x0f766e,
      transparent: true,
      opacity: 0.55,
    });
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 2],
    ].forEach(([a, b]) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        graphPoints[a],
        graphPoints[b],
      ]);
      graphGroup.add(new THREE.Line(geometry, lineMaterial));
    });
    addFloating(graphGroup, 1.62, 0.56, 0.22, [0.18, -0.26, 0.04]);

    addFloating(
      createPanel(1.24, 1.5, 0.06, 0xf8fafc, 0x10b981),
      3.12,
      0.2,
      -0.05,
      [-0.08, -0.5, 0.08],
    );

    const particles: THREE.Mesh[] = [];
    const particleMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x67e8f9,
      emissiveIntensity: 0.65,
      roughness: 0.18,
    });
    for (let i = 0; i < 16; i += 1) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + (i % 3) * 0.01, 16, 12),
        particleMaterial,
      );
      particle.userData = { offset: i / 16 };
      particles.push(particle);
      root.add(particle);
    }

    const resize = () => {
      const { clientWidth, clientHeight } = host;
      const width = Math.max(clientWidth, 1);
      const height = Math.max(clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let pointerX = 0;
    let pointerY = 0;

    const onPointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    };

    host.addEventListener("pointermove", onPointerMove);

    const clock = new THREE.Clock();
    let frame = 0;

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      floating.forEach((object, index) => {
        const baseY = object.userData.baseY as number;
        const phase = object.userData.phase as number;
        const speed = object.userData.speed as number;
        object.position.y = baseY + Math.sin(elapsed * speed + phase) * 0.08;
        object.rotation.z += Math.sin(elapsed * 0.35 + index) * 0.0009;
      });

      particles.forEach((particle) => {
        const offset = particle.userData.offset as number;
        const point = curve.getPoint((elapsed * 0.08 + offset) % 1);
        particle.position.copy(point);
        const scale = 0.8 + Math.sin(elapsed * 3 + offset * 8) * 0.2;
        particle.scale.setScalar(scale);
      });

      root.rotation.y = Math.sin(elapsed * 0.22) * 0.08 + pointerX * 0.08;
      root.rotation.x = Math.sin(elapsed * 0.18) * 0.035 - pointerY * 0.035;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, pointerX * 0.28, 0.045);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.05 - pointerY * 0.16, 0.045);
      camera.lookAt(0, 0.02, 0);

      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", onPointerMove);
      observer.disconnect();
      disposeObject(scene);
      renderer.dispose();
    };
  }, [reduce]);

  if (reduce) {
    return <StaticWorkflowMockup />;
  }

  return (
    <div
      className="landing-3d-stage"
      aria-label="Animated workflow scene showing sources becoming organized research outputs"
    >
      <canvas ref={canvasRef} className="landing-3d-canvas" />
      <div className="landing-3d-label landing-3d-label--source">Sources</div>
      <div className="landing-3d-label landing-3d-label--tags">AI tags</div>
      <div className="landing-3d-label landing-3d-label--map">Governance map</div>
      <div className="landing-3d-label landing-3d-label--notes">Notebook</div>
    </div>
  );
}

function LandingNav() {
  const navigate = useNavigate();
  const items = [
    { label: "Workflow", href: "#workflow" },
    { label: "Pages", href: "#pages" },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="landing-topbar">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-white/60"
            aria-label="Smart Scrape home"
          >
            <img
              src="/assets/logo.png"
              alt="Smart Scrape"
              className="h-8 w-8 rounded-lg shadow-sm ring-1 ring-black/5"
            />
            <span className="hidden text-sm font-semibold text-slate-950 sm:inline">
              Smart Scrape
            </span>
          </button>

          <nav className="hidden items-center gap-1 text-sm md:flex">
            {items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 font-medium text-slate-700 transition hover:bg-white/65 hover:text-slate-950"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/notebook")}
              className="hidden rounded-lg bg-white/70 px-3 py-2 text-sm font-semibold text-slate-800 ring-1 ring-black/10 transition hover:bg-white sm:inline-flex"
            >
              Notebook
            </button>
            <MagneticButton
              type="button"
              onClick={() => navigate("/app/url-collector")}
              className="landing-primary-btn landing-nav-primary items-center gap-2"
            >
              Open App <ArrowRight className="h-4 w-4" />
            </MagneticButton>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const navigate = useNavigate();

  return (
    <section className="landing-cinematic-hero">
      <div className="landing-hero-grid mx-auto max-w-7xl px-6">
        <div className="landing-hero-copy">
          <motion.h1
            className="mt-5 max-w-4xl text-4xl font-extrabold text-slate-950 md:text-6xl"
            {...heroFade(0)}
          >
            Turn scattered links and files into a structured research workspace.
          </motion.h1>

          <motion.p
            className="landing-hero-subtitle mt-5 max-w-2xl text-base leading-7 text-slate-700 md:text-lg"
            {...heroFade(0.12)}
          >
            Smart Scrape makes the full research path visible: collect sources,
            enrich them, organize evidence, map governance context, and write
            grounded notebooks from the archive you built.
          </motion.p>

          <motion.div
            className="landing-hero-actions mt-7 flex flex-wrap gap-3"
            {...heroFade(0.18)}
          >
            <MagneticButton
              type="button"
              onClick={() => navigate("/app/url-collector")}
              className="landing-primary-btn items-center gap-2"
            >
              Start collecting <ArrowRight className="h-4 w-4" />
            </MagneticButton>
            <MagneticButton
              type="button"
              onClick={() => navigate("/app/governance-workspace")}
              className="landing-secondary-btn items-center gap-2"
            >
              See governance workspace <Network className="h-4 w-4" />
            </MagneticButton>
          </motion.div>

          <motion.div className="landing-hero-metrics" {...heroFade(0.24)}>
            <span>
              <strong>5</strong> connected work surfaces
            </span>
            <span>
              <strong>1</strong> archive-backed flow
            </span>
            <span>
              <strong>AI</strong> tags, summaries, and evidence links
            </span>
          </motion.div>
        </div>

        <motion.div
          className="landing-hero-scene"
          initial={false}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.12 }}
        >
          <WorkflowScene3D />
        </motion.div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section id="workflow" className="landing-section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="landing-section-heading">
          <motion.div className="landing-eyebrow" {...fadeUp(0)}>
            <GitBranch className="h-4 w-4" />
            Workflow
          </motion.div>
          <motion.h2 className="mt-4 text-3xl font-bold text-slate-950 md:text-5xl" {...fadeUp(0.06)}>
            The archive moves with intention.
          </motion.h2>
          <motion.p className="mt-4 max-w-2xl text-slate-600" {...fadeUp(0.12)}>
            Each page has a clear job, and every job feeds the next stage of the
            research process.
          </motion.p>
        </div>

        <div className="landing-workflow-grid">
          {WORKFLOW_STEPS.map((step, index) => (
            <motion.a
              key={step.id}
              href={step.route}
              className="landing-workflow-step group"
              {...fadeUp(0.06 + index * 0.04)}
            >
              <span className="landing-workflow-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="landing-workflow-icon">{step.icon}</span>
              <span className="landing-workflow-verb">{step.verb}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <span className="landing-workflow-proof">{step.proof}</span>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

function PageDirectory() {
  return (
    <section id="pages" className="landing-section landing-section--soft">
      <div className="mx-auto max-w-7xl px-6">
        <div className="landing-section-heading">
          <motion.div className="landing-eyebrow" {...fadeUp(0)}>
            <BookOpen className="h-4 w-4" />
            Individual pages
          </motion.div>
          <motion.h2 className="mt-4 text-3xl font-bold text-slate-950 md:text-5xl" {...fadeUp(0.06)}>
            Every page earns its place.
          </motion.h2>
          <motion.p className="mt-4 max-w-2xl text-slate-600" {...fadeUp(0.12)}>
            The landing page should not just look premium. It should explain
            where a new user goes next and why.
          </motion.p>
        </div>

        <div className="landing-page-grid">
          {PAGE_DIRECTORY.map((page, index) => (
            <motion.a
              key={page.route}
              href={page.route}
              className="landing-product-card group"
              {...fadeUp(0.05 + index * 0.04)}
            >
              <span className="landing-product-icon">{page.icon}</span>
              <span className="landing-product-eyebrow">{page.eyebrow}</span>
              <h3>{page.title}</h3>
              <p>{page.description}</p>
              <ul>
                {page.highlights.map((highlight) => (
                  <li key={highlight}>
                    <CheckCircle2 className="h-4 w-4" />
                    {highlight}
                  </li>
                ))}
              </ul>
              <span className="landing-product-link">
                Open page <ArrowRight className="h-4 w-4" />
              </span>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}

function BottomCTA() {

  const navigate = useNavigate();

  return (
    <section className="landing-final-cta">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div className="landing-final-cta-inner" {...fadeUp(0)}>
          <div>
            <p className="landing-final-kicker">Ready when the archive is.</p>
            <h2>Start with the first source. Keep the full trail.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <MagneticButton
              type="button"
              onClick={() => navigate("/app/url-collector")}
              className="landing-primary-btn landing-primary-btn--onDark items-center gap-2"
            >
              Open URL Collector <ArrowRight className="h-4 w-4" />
            </MagneticButton>
            <MagneticButton
              type="button"
              onClick={() => navigate("/notebook")}
              className="landing-dark-secondary-btn items-center gap-2"
            >
              Open Notebook <BookOpen className="h-4 w-4" />
            </MagneticButton>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.add("landing-scroll-root");
    body.classList.add("landing-scroll-root");

    return () => {
      root.classList.remove("landing-scroll-root");
      body.classList.remove("landing-scroll-root");
    };
  }, []);

  return (
    <main className="landing-site min-h-screen antialiased">
      <LandingNav />
      <Hero />
      <WorkflowSection />
      <PageDirectory />
      <BottomCTA />
      <footer className="landing-footer">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-9 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <img
              src="/assets/logo.png"
              alt="Smart Scrape"
              className="h-7 w-7 rounded-lg ring-1 ring-black/5"
            />
            <span className="font-semibold text-slate-700">Smart Scrape</span>
          </div>
          <span>Copyright {new Date().getFullYear()} - built with care.</span>
        </div>
      </footer>
    </main>
  );
}
