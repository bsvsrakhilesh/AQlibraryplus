import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as yazl from "yazl";

import { extractTextFromFile } from "../services/extract.service";
import { getNotebookIngestionCapability } from "../utils/fileCapabilities";

async function makeDocx(documentXml: string): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  zip.addBuffer(Buffer.from(documentXml, "utf8"), "word/document.xml");
  zip.end();
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    zip.outputStream.on("error", reject);
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

test("notebook ingestion accepts text documents and rejects image-only files", () => {
  assert.equal(getNotebookIngestionCapability("report.pdf").supported, true);
  assert.equal(getNotebookIngestionCapability("brief.docx").supported, true);
  assert.equal(getNotebookIngestionCapability("photo.png").supported, false);
});

test("DOCX extraction returns document text instead of ZIP bytes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "smartscrape-docx-"));
  const filePath = path.join(dir, "brief.docx");
  try {
    await writeFile(
      filePath,
      await makeDocx(
        '<w:document xmlns:w="x"><w:body><w:p><w:r><w:t>First &amp; second</w:t></w:r></w:p><w:p><w:r><w:t>Final line</w:t></w:r></w:p></w:body></w:document>',
      ),
    );
    const text = await extractTextFromFile(
      filePath,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.equal(text, "First & second\nFinal line");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("HTML extraction excludes scripts and returns readable text", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "smartscrape-html-"));
  const filePath = path.join(dir, "page.html");
  try {
    await writeFile(
      filePath,
      "<html><body><h1>Evidence title</h1><script>ignoreMe()</script><p>Useful paragraph.</p></body></html>",
      "utf8",
    );
    const text = await extractTextFromFile(filePath, "text/html");
    assert.equal(text, "Evidence title Useful paragraph.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
