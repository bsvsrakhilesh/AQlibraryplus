import React, { useEffect, useState } from "react";

import AppShell from "./layouts/AppShell";
import Sidebar from "./components/common/Sidebar";

import UrlCollectorPage from "./pages/UrlCollectorPage";
import SavedUrlsPage from "./pages/SavedUrlsPage";
import FileManagerPage from "./pages/FileManagerPage";
import NotebookPage from "./pages/NotebookPage";

import { Page } from "./types";
import { ToastProvider } from "./components/providers/Toast";
import { ConfirmProvider } from "./components/providers/Confirm";

const STORAGE_KEY = "sidebar.expanded";

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const h =
      typeof window !== "undefined"
        ? window.location.hash.replace("#", "")
        : "";
    const allowed = new Set<Page>([
      "url-collector",
      "saved-urls",
      "file-manager",
      "notebook",
    ]);
    return allowed.has(h as Page) ? (h as Page) : "url-collector";
  });

  // Initialize from localStorage (default true)
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const next = `#${currentPage}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [currentPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (currentPage !== "notebook") return;

    // Ensure notebook always opens with its page header visible.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      // Second tick beats late layout shifts (fonts, async content)
      setTimeout(
        () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
        0
      );
    });
  }, [currentPage]);

  // Persist sidebar state
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(isSidebarOpen));
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        (e.target as HTMLElement)?.isContentEditable;
      if (typing) return;
      if (e.key === "[") {
        e.preventDefault();
        setIsSidebarOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const renderPages = () => (
    <>
      <div
        style={{ display: currentPage === "url-collector" ? "block" : "none" }}
      >
        <UrlCollectorPage />
      </div>

      {currentPage === "saved-urls" && <SavedUrlsPage />}
      {currentPage === "file-manager" && <FileManagerPage />}
      {currentPage === "notebook" && <NotebookPage />}
    </>
  );
  const workspacePages: Page[] = [
    "url-collector",
    "saved-urls",
    "file-manager",
  ];
  const isWorkspacePage = workspacePages.includes(currentPage);
  const isNotebookPage = currentPage === "notebook";

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppShell
          sidebar={
            <Sidebar
              isOpen={isSidebarOpen}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              useParentWidth
            />
          }
          sidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
          onNavigateHome={() => setCurrentPage("url-collector")}
          hideAmbient={isWorkspacePage}
          variant={isNotebookPage ? "notebook" : "workspace"}
        >
          {renderPages()}
        </AppShell>
      </ConfirmProvider>
    </ToastProvider>
  );
};

export default App;
