import { expect, test, type Page, type Route } from "@playwright/test";

type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  deletedAt?: string | null;
};

type FileRow = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  description: string;
  uploaderName: string;
  uploaderId: string;
  storagePath: string;
  createdAt: string;
  folderId: string | null;
  userTags: string[];
  aiTags: string[];
  tags: string[];
  isFavorited: boolean;
  favoritesCount: number;
  taggingStatus: "NONE" | "PENDING" | "SUCCESS" | "FAILED";
  captureType: "UPLOAD" | "URL_TEXT" | "URL_PDF";
  deletedAt?: string | null;
};

const now = () => new Date().toISOString();

function fileRow(overrides: Partial<FileRow> & Pick<FileRow, "id" | "fileName">): FileRow {
  return {
    mimeType: "text/plain",
    size: 34,
    description: "",
    uploaderName: "E2E Test",
    uploaderId: "e2e",
    storagePath: "/tmp/e2e.txt",
    createdAt: now(),
    folderId: null,
    userTags: [],
    aiTags: [],
    tags: [],
    isFavorited: false,
    favoritesCount: 0,
    taggingStatus: "NONE",
    captureType: "UPLOAD",
    ...overrides,
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installFileManagerApi(page: Page) {
  const folders: FolderRow[] = [];
  const files: FileRow[] = [];
  const previewTextById = new Map<string, string>();
  let folderSeq = 1;
  let fileSeq = 1;

  const activeFolders = (parentId: string | null) =>
    folders.filter((folder) => !folder.deletedAt && folder.parentId === parentId);

  const activeFiles = (folderId: string | null) =>
    files.filter((file) => !file.deletedAt && file.folderId === folderId);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;

    if (method === "GET" && pathname === "/api/storage/usage") {
      return json(route, {
        usedBytes: files.filter((file) => !file.deletedAt).reduce((sum, file) => sum + file.size, 0),
        fileCount: files.filter((file) => !file.deletedAt).length,
        capacityBytes: null,
      });
    }

    if (method === "GET" && pathname === "/api/tags") return json(route, []);
    if (method === "GET" && pathname === "/api/collector-purposes") return json(route, []);

    if (method === "POST" && pathname === "/api/files/review-queue-counts") {
      return json(route, {
        all: files.filter((file) => !file.deletedAt).length,
        "ai-failed": 0,
        "metadata-missing": 0,
        "hash-pending": 0,
        "updated-since-review": 0,
      });
    }

    if (method === "GET" && pathname === "/api/explorer") {
      const folderParam = url.searchParams.get("folderId");
      const folderId = folderParam && folderParam !== "root" ? folderParam : null;
      const folderItems = activeFolders(folderId).map((folder) => ({
        ...folder,
        kind: "folder",
        itemType: "folder",
      }));
      const fileItems = activeFiles(folderId).map((file) => ({
        ...file,
        kind: "file",
        itemType: "file",
      }));
      const items = [...folderItems, ...fileItems];

      return json(route, {
        items,
        total: items.length,
        totalBytes: fileItems.reduce((sum, file) => sum + file.size, 0),
        counts: { folders: folderItems.length, files: fileItems.length },
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 30),
      });
    }

    if (method === "GET" && pathname === "/api/folders") {
      const parentParam = url.searchParams.get("parentId");
      const parentId = parentParam && parentParam !== "root" ? parentParam : null;
      return json(route, activeFolders(parentId));
    }

    if (method === "POST" && pathname === "/api/folders") {
      const body = request.postDataJSON() as { name: string; parentId?: string | null };
      const folder: FolderRow = {
        id: `folder-${folderSeq++}`,
        name: body.name,
        parentId: body.parentId && body.parentId !== "root" ? body.parentId : null,
        createdAt: now(),
        deletedAt: null,
      };
      folders.unshift(folder);
      return json(route, folder, 201);
    }

    const folderMatch = pathname.match(/^\/api\/folders\/([^/]+)(?:\/(trash|restore|ancestors))?$/);
    if (folderMatch) {
      const folderId = decodeURIComponent(folderMatch[1]);
      const action = folderMatch[2];
      const folder = folders.find((row) => row.id === folderId);
      if (!folder) return json(route, { message: "Folder not found" }, 404);

      if (method === "GET" && action === "ancestors") return json(route, []);
      if (method === "GET" && !action) return json(route, folder);
      if (method === "PATCH" && action === "trash") {
        folder.deletedAt = now();
        files.filter((file) => file.folderId === folderId).forEach((file) => {
          file.deletedAt = now();
        });
        return json(route, { ok: true });
      }
      if (method === "PATCH" && action === "restore") {
        folder.deletedAt = null;
        files.filter((file) => file.folderId === folderId).forEach((file) => {
          file.deletedAt = null;
        });
        return json(route, { ok: true });
      }
    }

    if (method === "POST" && pathname === "/api/files/upload/chunk") {
      const raw = request.postData() || "";
      const fileName =
        raw.match(/name="fileName"\r?\n\r?\n([^\r\n]+)/)?.[1]?.trim() ||
        raw.match(/filename="([^"]+)"/)?.[1]?.trim() ||
        `uploaded-${fileSeq}.txt`;
      const folderId =
        raw.match(/name="folderId"\r?\n\r?\n([^\r\n]+)/)?.[1]?.trim() || null;
      const created = fileRow({
        id: `file-${fileSeq++}`,
        fileName,
        mimeType: "text/plain",
        folderId,
        size: 34,
      });
      files.unshift(created);
      previewTextById.set(created.id, "hello from the Playwright upload");
      return json(route, created);
    }

    if (method === "POST" && pathname === "/api/files/finalize") {
      const body = request.postDataJSON() as {
        fileName: string;
        mimeType?: string;
        folderId?: string | null;
      };
      const created = fileRow({
        id: `file-${fileSeq++}`,
        fileName: body.fileName,
        mimeType: body.mimeType || "text/plain",
        folderId: body.folderId || null,
        size: 34,
      });
      files.unshift(created);
      previewTextById.set(created.id, "hello from the Playwright upload");
      return json(route, created);
    }

    if (method === "GET" && pathname === "/api/trash") {
      const trashedFolders = folders.filter((folder) => !!folder.deletedAt);
      const trashedFiles = files.filter((file) => !!file.deletedAt);
      return json(route, {
        folders: trashedFolders,
        files: trashedFiles,
        total: trashedFiles.length,
        totalBytes: trashedFiles.reduce((sum, file) => sum + file.size, 0),
      });
    }

    const fileMatch = pathname.match(/^\/api\/files\/([^/]+)(?:\/(preview|rename|duplicate|trash|restore|move))?$/);
    if (fileMatch) {
      const fileId = decodeURIComponent(fileMatch[1]);
      const action = fileMatch[2];
      const file = files.find((row) => row.id === fileId);
      if (!file) return json(route, { message: "File not found" }, 404);

      if (method === "GET" && action === "preview") {
        return route.fulfill({
          status: 200,
          contentType: "text/plain",
          headers: { "content-disposition": `inline; filename="${file.fileName}"` },
          body: previewTextById.get(file.id) || "",
        });
      }

      if (method === "GET" && !action) return json(route, file);

      if (method === "PUT" && action === "rename") {
        const body = request.postDataJSON() as { fileName: string };
        file.fileName = body.fileName;
        return json(route, { id: file.id, fileName: file.fileName });
      }

      if (method === "PATCH" && !action) {
        const body = request.postDataJSON() as Partial<FileRow> & { tags?: string[] };
        if (Array.isArray(body.tags)) {
          file.userTags = body.tags;
          file.tags = [...new Set([...body.tags, ...file.aiTags])];
        }
        if (typeof body.isFavorited === "boolean") {
          file.isFavorited = body.isFavorited;
          file.favoritesCount = body.isFavorited ? 1 : 0;
        }
        return json(route, file);
      }

      if (method === "POST" && action === "duplicate") {
        const body = request.postDataJSON() as { fileName?: string; folderId?: string | null };
        const copy = fileRow({
          ...file,
          id: `file-${fileSeq++}`,
          fileName: body.fileName || `${file.fileName.replace(/(\.[^.]+)?$/, "")} copy$1`,
          folderId: body.folderId ?? file.folderId,
          createdAt: now(),
          deletedAt: null,
        });
        files.unshift(copy);
        previewTextById.set(copy.id, previewTextById.get(file.id) || "");
        return json(route, copy, 201);
      }

      if (method === "PATCH" && action === "trash") {
        file.deletedAt = now();
        return json(route, file);
      }

      if (method === "PATCH" && action === "restore") {
        file.deletedAt = null;
        return json(route, file);
      }
    }

    return json(route, {});
  });
}

async function selectMenuItem(page: Page, name: RegExp) {
  const item = page.getByRole("menuitem", { name });
  await expect(item).toBeVisible();
  await item.evaluate((element) => (element as HTMLButtonElement).click());
}

async function openContextMenu(locator: ReturnType<Page["locator"]>) {
  await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + Math.min(24, rect.width / 2),
        clientY: rect.top + Math.min(24, rect.height / 2),
      }),
    );
  });
}

test("file manager supports folder, chunk upload, preview, CRUD, duplicate, delete and restore flows", async ({
  page,
}) => {
  await installFileManagerApi(page);

  await page.goto("/app/file-manager");
  await expect(page.getByText("This workspace is empty")).toBeVisible();

  await page.getByRole("button", { name: "New folder" }).first().click();
  await page.getByRole("dialog", { name: "New folder" }).getByRole("textbox").fill("JOSS Evidence");
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(page.locator('[data-testid="folder-tile"][data-file-name="JOSS Evidence"]')).toBeVisible();

  await page.getByRole("button", { name: /^Upload$/ }).click();
  const uploadDialog = page.getByRole("dialog", { name: "Upload files" });
  await expect(uploadDialog).toBeVisible();
  await uploadDialog.locator('input[name="upload-files"]').setInputFiles({
    name: "source-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello from the Playwright upload"),
  });
  await expect(uploadDialog.getByText("1 file uploaded")).toBeVisible();
  await uploadDialog.getByRole("button", { name: "Close" }).click();

  const fileTile = page.locator('[data-testid="file-tile"][data-file-name="source-notes.txt"]');
  await expect(fileTile).toBeVisible();
  await fileTile.click();
  await fileTile.click();

  const preview = page.getByRole("dialog", { name: "source-notes.txt" });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("hello from the Playwright upload")).toBeVisible();
  await preview.getByPlaceholder("Add tag").fill("reviewed");
  await preview.getByRole("button", { name: "Add", exact: true }).click();
  await expect(preview.getByText("reviewed")).toBeVisible();
  await preview.getByRole("button", { name: "Close" }).click();

  await openContextMenu(fileTile);
  await selectMenuItem(page, /^Rename/);
  await page.getByRole("dialog", { name: "Rename item" }).getByRole("textbox").fill("source-notes-renamed.txt");
  await page.getByRole("button", { name: "Rename" }).click();
  await expect(page.locator('[data-testid="file-tile"][data-file-name="source-notes-renamed.txt"]')).toBeVisible();

  const renamedTile = page.locator('[data-testid="file-tile"][data-file-name="source-notes-renamed.txt"]');
  await renamedTile.click();
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(page.getByRole("button", { name: "Paste", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.locator('[data-testid="file-tile"]').filter({ hasText: "copy" })).toBeVisible();

  await renamedTile.click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Move to Trash?" }).getByRole("button", { name: "Move to Trash" }).click();
  await expect(renamedTile).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-testid="file-tile"][data-file-name="source-notes-renamed.txt"]')).toBeVisible();

  const folderTile = page.locator('[data-testid="folder-tile"][data-file-name="JOSS Evidence"]');
  await folderTile.click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Move to Trash?" }).getByRole("button", { name: "Move to Trash" }).click();
  await expect(folderTile).toBeHidden();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-testid="folder-tile"][data-file-name="JOSS Evidence"]')).toBeVisible();
});
