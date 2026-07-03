import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);
const WEAK_PAGE_CHAR_THRESHOLD = 40;

export type OcrEnginePreference = "auto" | "ocrmypdf" | "tesseract";
export type OcrEngineUsed = "ocrmypdf" | "tesseract_fallback";

export type OcrOptions = {
  engine?: OcrEnginePreference;
  dpi: number;
  langs: string;
  maxPages: number;
  pages?: string | null;
  pageCount?: number | null;
  renderTimeoutMs: number;
  pageTimeoutMs: number;
  deskew?: boolean;
  rotatePages?: boolean;
  clean?: boolean;
  fallback?: boolean;
  forceOcr?: boolean;
  onProgress?: (event: {
    stage: string;
    pageNumber?: number;
    processedPages?: number;
    totalPages?: number;
    engine: OcrEngineUsed;
  }) => void | Promise<void>;
};

export type OcrPageResult = {
  pageNumber: number;
  text: string;
  charCount: number;
  isBlank: boolean;
  isWeak: boolean;
  engine: OcrEngineUsed;
};

export type OcrQualitySummary = {
  pageCount: number;
  blankPageCount: number;
  weakPageCount: number;
  charCount: number;
};

export type OcrPdfResult = {
  engine: OcrEngineUsed;
  fallbackUsed: boolean;
  pages: OcrPageResult[];
  quality: OcrQualitySummary;
  options: {
    langs: string;
    pages: string | null;
    deskew: boolean;
    rotatePages: boolean;
    clean: boolean;
    maxPages: number;
  };
  errors: string[];
};

const execImpl = async (
  bin: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string },
) => {
  const { stdout, stderr } = await execFileAsync(bin, args, {
    cwd: opts.cwd,
    timeout: opts.timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
  });
  return { stdout: stdout ?? "", stderr: stderr ?? "" };
};

function normalizeLangs(value: string | null | undefined) {
  return String(value || "eng")
    .replace(/[^a-zA-Z0-9_+.-]/g, "")
    .trim() || "eng";
}

async function safeExec(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string },
) {
  try {
    return await execImpl(bin, args, opts);
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("ENOENT")) {
      throw new Error(
        `OCR dependency missing: ${bin} not found in PATH. Install OCRmyPDF/Tesseract/Poppler in the backend image.`,
      );
    }
    throw new Error(`${bin} failed: ${msg}`);
  }
}

export function parseOcrPageSelection(
  pages: string | null | undefined,
  pageCount?: number | null,
) {
  const raw = String(pages || "").trim();
  if (!raw) return null;

  const selected = new Set<number>();
  for (const part of raw.split(",")) {
    const token = part.trim();
    const m = token.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Invalid OCR page range: ${raw}`);

    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : start;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1) {
      throw new Error(`Invalid OCR page range: ${raw}`);
    }
    if (end < start) throw new Error(`Invalid OCR page range: ${raw}`);

    for (let page = start; page <= end; page += 1) {
      if (pageCount && page > pageCount) {
        throw new Error(
          `OCR page range includes page ${page}, but this PDF has ${pageCount} page(s).`,
        );
      }
      selected.add(page);
      if (selected.size > 1000) {
        throw new Error("OCR page range is too large.");
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

export function assertOcrPageLimit(args: {
  pageCount?: number | null;
  pageNumbers: number[] | null;
  maxPages: number;
}) {
  const maxPages = Math.max(1, args.maxPages);
  if (args.pageNumbers) {
    if (args.pageNumbers.length > maxPages) {
      throw new Error(
        `OCR page range has ${args.pageNumbers.length} page(s), above OCR_MAX_PAGES=${maxPages}. Choose a smaller range or raise OCR_MAX_PAGES.`,
      );
    }
    return;
  }

  if (args.pageCount && args.pageCount > maxPages) {
    throw new Error(
      `Scanned PDF has ${args.pageCount} page(s), above OCR_MAX_PAGES=${maxPages}. Choose a page range such as 1-${maxPages}, or raise OCR_MAX_PAGES.`,
    );
  }
}

function sortPagePngs(files: string[]) {
  const rx = /-(\d+)\.png$/i;
  return files
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .map((f) => {
      const m = f.match(rx);
      return { f, n: m ? Number(m[1]) : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.n - b.n)
    .map((x) => x.f);
}

function summarizeOcrPages(pages: OcrPageResult[]): OcrQualitySummary {
  return {
    pageCount: pages.length,
    blankPageCount: pages.filter((p) => p.isBlank).length,
    weakPageCount: pages.filter((p) => p.isWeak).length,
    charCount: pages.reduce((sum, p) => sum + p.charCount, 0),
  };
}

function makePageResult(
  pageNumber: number,
  text: string,
  engine: OcrEngineUsed,
): OcrPageResult {
  const clean = (text || "").replace(/\u0000/g, "").trim();
  const charCount = clean.replace(/\s+/g, "").length;
  return {
    pageNumber,
    text: clean,
    charCount,
    isBlank: charCount === 0,
    isWeak: charCount > 0 && charCount < WEAK_PAGE_CHAR_THRESHOLD,
    engine,
  };
}

export function buildOcrmypdfArgs(args: {
  inputPath: string;
  outputPath: string;
  sidecarPath: string;
  langs: string;
  pages?: string | null;
  deskew: boolean;
  rotatePages: boolean;
  clean: boolean;
  forceOcr: boolean;
}) {
  const out = [
    "--sidecar",
    args.sidecarPath,
    "--output-type",
    "pdf",
    "--jobs",
    "1",
    "-l",
    normalizeLangs(args.langs),
  ];

  if (args.deskew) out.push("--deskew");
  if (args.rotatePages) out.push("--rotate-pages");
  if (args.clean) out.push("--clean");
  if (args.pages) out.push("--pages", args.pages);
  out.push(args.forceOcr ? "--force-ocr" : "--skip-text");
  out.push(args.inputPath, args.outputPath);
  return out;
}

async function ocrWithOcrmypdf(
  storagePath: string,
  opts: OcrOptions,
): Promise<OcrPdfResult> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aqlibraryplus-ocrpdf-"));
  const sidecarPath = path.join(tmp, "sidecar.txt");
  const outputPath = path.join(tmp, "ocr.pdf");
  const pageNumbers = parseOcrPageSelection(opts.pages, opts.pageCount);

  try {
    assertOcrPageLimit({
      pageCount: opts.pageCount,
      pageNumbers,
      maxPages: opts.maxPages,
    });

    await opts.onProgress?.({
      stage: "ocrmypdf_start",
      engine: "ocrmypdf",
      totalPages: pageNumbers?.length ?? opts.pageCount ?? undefined,
    });

    const args = buildOcrmypdfArgs({
      inputPath: storagePath,
      outputPath,
      sidecarPath,
      langs: opts.langs,
      pages: opts.pages ?? null,
      deskew: opts.deskew !== false,
      rotatePages: opts.rotatePages !== false,
      clean: opts.clean === true,
      forceOcr: opts.forceOcr === true,
    });

    await safeExec("ocrmypdf", args, {
      timeoutMs:
        opts.renderTimeoutMs +
        Math.max(1, pageNumbers?.length ?? opts.pageCount ?? opts.maxPages) *
          opts.pageTimeoutMs,
    });

    const sidecar = await fs.readFile(sidecarPath, "utf8");
    const parts = sidecar.split(/\f/g);
    const selected =
      pageNumbers ??
      Array.from(
        { length: opts.pageCount ?? parts.length },
        (_, index) => index + 1,
      ).slice(0, opts.maxPages);
    const pages = selected.map((pageNumber, index) =>
      makePageResult(pageNumber, parts[index] ?? "", "ocrmypdf"),
    );

    await opts.onProgress?.({
      stage: "ocrmypdf_complete",
      engine: "ocrmypdf",
      processedPages: pages.length,
      totalPages: pages.length,
    });

    return {
      engine: "ocrmypdf",
      fallbackUsed: false,
      pages,
      quality: summarizeOcrPages(pages),
      options: {
        langs: normalizeLangs(opts.langs),
        pages: opts.pages ?? null,
        deskew: opts.deskew !== false,
        rotatePages: opts.rotatePages !== false,
        clean: opts.clean === true,
        maxPages: opts.maxPages,
      },
      errors: [],
    };
  } finally {
    try {
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function ocrWithTesseract(
  storagePath: string,
  opts: OcrOptions,
  fallbackUsed: boolean,
): Promise<OcrPdfResult> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aqlibraryplus-ocr-"));
  const prefix = path.join(tmp, "page");
  const pageNumbers = parseOcrPageSelection(opts.pages, opts.pageCount);

  try {
    assertOcrPageLimit({
      pageCount: opts.pageCount,
      pageNumbers,
      maxPages: opts.maxPages,
    });

    const selected =
      pageNumbers ??
      Array.from(
        { length: Math.min(opts.pageCount ?? opts.maxPages, opts.maxPages) },
        (_, index) => index + 1,
      );
    if (!selected.length) throw new Error("No OCR pages selected.");

    const firstPage = Math.min(...selected);
    const lastPage = Math.max(...selected);

    await opts.onProgress?.({
      stage: "render_start",
      engine: "tesseract_fallback",
      totalPages: selected.length,
    });

    await safeExec(
      "pdftoppm",
      [
        "-f",
        String(firstPage),
        "-l",
        String(lastPage),
        "-r",
        String(Math.max(72, opts.dpi)),
        "-png",
        storagePath,
        prefix,
      ],
      { timeoutMs: opts.renderTimeoutMs },
    );

    const selectedSet = new Set(selected);
    const files = sortPagePngs(await fs.readdir(tmp)).filter((file) => {
      const m = file.match(/-(\d+)\.png$/i);
      return selectedSet.has(m ? Number(m[1]) : -1);
    });
    if (!files.length) {
      throw new Error("OCR render produced no selected page images.");
    }

    const pages: OcrPageResult[] = [];
    for (const f of files) {
      const m = f.match(/-(\d+)\.png$/i);
      const pageNumber = m ? Number(m[1]) : pages.length + 1;
      const imgPath = path.join(tmp, f);

      const { stdout } = await safeExec(
        "tesseract",
        [
          imgPath,
          "stdout",
          "-l",
          normalizeLangs(opts.langs),
          "--dpi",
          String(Math.max(72, opts.dpi)),
          "-c",
          "preserve_interword_spaces=1",
        ],
        { timeoutMs: opts.pageTimeoutMs },
      );

      pages.push(makePageResult(pageNumber, stdout, "tesseract_fallback"));
      await opts.onProgress?.({
        stage: "tesseract_page_complete",
        pageNumber,
        processedPages: pages.length,
        totalPages: selected.length,
        engine: "tesseract_fallback",
      });
    }

    return {
      engine: "tesseract_fallback",
      fallbackUsed,
      pages,
      quality: summarizeOcrPages(pages),
      options: {
        langs: normalizeLangs(opts.langs),
        pages: opts.pages ?? null,
        deskew: false,
        rotatePages: false,
        clean: false,
        maxPages: opts.maxPages,
      },
      errors: [],
    };
  } finally {
    try {
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function ocrPdfWithRouterFromFile(
  storagePath: string,
  opts: OcrOptions,
): Promise<OcrPdfResult> {
  const engine = opts.engine ?? "auto";
  const fallback = opts.fallback !== false;

  if (engine === "tesseract") {
    return ocrWithTesseract(storagePath, opts, false);
  }

  try {
    return await ocrWithOcrmypdf(storagePath, opts);
  } catch (error: any) {
    if (engine === "ocrmypdf" || !fallback) throw error;
    const result = await ocrWithTesseract(storagePath, opts, true);
    result.errors.push(error?.message ?? String(error));
    return result;
  }
}

export async function ocrPdfToPagesFromFile(
  storagePath: string,
  opts: {
    dpi: number;
    langs: string;
    maxPages: number;
    renderTimeoutMs: number;
    pageTimeoutMs: number;
  },
): Promise<{ pageNumber: number; text: string }[]> {
  const result = await ocrWithTesseract(
    storagePath,
    {
      ...opts,
      engine: "tesseract",
      fallback: false,
    },
    false,
  );
  return result.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text,
  }));
}
