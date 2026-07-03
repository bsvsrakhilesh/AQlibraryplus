import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startServer(router: any): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err?.status || 500).json({ message: err?.message || "error" });
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    baseUrl: `http://127.0.0.1:${address.port}/api`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function jsonRequest(
  server: TestServer,
  pathName: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${server.baseUrl}${pathName}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json().catch(() => null),
    text: async () => response.text(),
  };
}

test("file and folder API workflow persists through real database and disk", async (t) => {
  const testDatabaseUrl = process.env.AQLIBRARYPLUS_TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    t.skip(
      "set AQLIBRARYPLUS_TEST_DATABASE_URL to run the file/folder API database integration test",
    );
    return;
  }

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.AQLIBRARYPLUS_DISABLE_AUTO_TAG_QUEUE = "true";
  process.env.FILE_STORAGE_DIR = fs.mkdtempSync(
    path.join(os.tmpdir(), "aqlibrary-plus-file-api-it-"),
  );

  const [{ default: router }, { default: prisma }] = await Promise.all([
    import("../routes/file.routes"),
    import("../config/database"),
  ]);

  const runId = `file-api-it-${Date.now()}-${process.pid}`;
  const server = await startServer(router);
  const createdFileIds: string[] = [];
  const createdFolderIds: string[] = [];

  try {
    const createFolder = await jsonRequest(server, "/folders", {
      method: "POST",
      body: JSON.stringify({ name: `${runId}-folder` }),
    });
    assert.equal(createFolder.status, 201);
    createdFolderIds.push(createFolder.body.id);

    const listFolders = await jsonRequest(server, "/folders?parentId=root");
    assert.equal(listFolders.status, 200);
    assert.ok(
      listFolders.body.some((folder: any) => folder.id === createFolder.body.id),
    );

    const uploadSessionId = `${runId.replace(/[^a-z0-9-]/gi, "").slice(0, 40)}-upload`;
    const chunkDir = path.join(
      process.env.FILE_STORAGE_DIR,
      "chunks",
      uploadSessionId.toLowerCase(),
    );
    fs.mkdirSync(chunkDir, { recursive: true });
    fs.writeFileSync(path.join(chunkDir, "0.part"), "<svg ");
    fs.writeFileSync(path.join(chunkDir, "1.part"), "xmlns=\"http://www.w3.org/2000/svg\"></svg>");

    const finalize = await jsonRequest(server, "/files/finalize", {
      method: "POST",
      body: JSON.stringify({
        uploadSessionId,
        fileName: `${runId}.svg`,
        mimeType: "image/svg+xml",
        description: "Real database upload workflow",
        folderId: createFolder.body.id,
      }),
    });
    assert.equal(finalize.status, 200);
    createdFileIds.push(finalize.body.id);
    assert.equal(finalize.body.folderId, createFolder.body.id);
    assert.equal(finalize.body.taggingStatus, "NONE");
    assert.equal(fs.existsSync(finalize.body.storagePath), true);

    const storedUpload = await prisma.storedFile.findUnique({
      where: { id: finalize.body.id },
      include: { documentRevision: true, captureEvent: true },
    });
    assert.ok(storedUpload);
    assert.ok(storedUpload?.documentRevision);
    assert.ok(storedUpload?.captureEvent);

    const previewPath = path.join(process.env.FILE_STORAGE_DIR, `${runId}.txt`);
    fs.writeFileSync(previewPath, "hello from the database integration test");
    const previewFile = await prisma.storedFile.create({
      data: {
        fileName: `${runId}.txt`,
        mimeType: "text/plain",
        size: fs.statSync(previewPath).size,
        description: "Preview fixture",
        uploaderName: "Integration Test",
        uploaderId: "integration",
        storagePath: previewPath,
        folderId: createFolder.body.id,
        taggingStatus: "NONE",
      },
    });
    createdFileIds.push(previewFile.id);

    const preview = await fetch(`${server.baseUrl}/files/${previewFile.id}/preview`);
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get("content-disposition") || "", /^inline;/);
    assert.equal(
      await preview.text(),
      "hello from the database integration test",
    );

    const update = await jsonRequest(server, `/files/${previewFile.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        description: "Updated through API",
        tags: ["reviewed", "joss"],
        isFavorited: true,
      }),
    });
    assert.equal(update.status, 200);
    assert.equal(update.body.description, "Updated through API");
    assert.equal(update.body.isFavorited, true);
    assert.equal(update.body.favoritesCount, 1);
    assert.deepEqual(update.body.userTags, ["reviewed", "joss"]);

    const duplicate = await jsonRequest(server, `/files/${previewFile.id}/duplicate`, {
      method: "POST",
      body: JSON.stringify({
        fileName: `${runId}-copy.txt`,
        folderId: createFolder.body.id,
      }),
    });
    assert.equal(duplicate.status, 201);
    createdFileIds.push(duplicate.body.id);
    assert.equal(duplicate.body.folderId, createFolder.body.id);

    const trash = await jsonRequest(server, `/files/${previewFile.id}/trash`, {
      method: "PATCH",
    });
    assert.equal(trash.status, 200);
    assert.ok(trash.body.deletedAt);

    const restore = await jsonRequest(server, `/files/${previewFile.id}/restore`, {
      method: "PATCH",
    });
    assert.equal(restore.status, 200);
    assert.equal(restore.body.deletedAt, null);

    const folderTrash = await jsonRequest(server, `/folders/${createFolder.body.id}/trash`, {
      method: "PATCH",
    });
    assert.equal(folderTrash.status, 200);
    assert.deepEqual(folderTrash.body, { ok: true });

    const folderRestore = await jsonRequest(
      server,
      `/folders/${createFolder.body.id}/restore`,
      { method: "PATCH" },
    );
    assert.equal(folderRestore.status, 200);
    assert.deepEqual(folderRestore.body, { ok: true });
  } finally {
    await server.close();
    for (const fileId of createdFileIds.reverse()) {
      await prisma.storedFile.deleteMany({ where: { id: fileId } });
    }
    for (const folderId of createdFolderIds.reverse()) {
      await prisma.folder.deleteMany({ where: { id: folderId } });
    }
    fs.rmSync(process.env.FILE_STORAGE_DIR, { recursive: true, force: true });
    await prisma.$disconnect();
  }
});
