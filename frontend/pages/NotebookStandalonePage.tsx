import { useEffect } from "react";
import NotebookTopNav from "../components/notebook/NotebookTopNav";
import NotebookPage from "./NotebookPage";
import { ToastProvider } from "../components/providers/Toast";
import { ConfirmProvider } from "../components/providers/Confirm";

export default function NotebookStandalonePage() {
  // Always start at the top when opening the Notebook route.
  useEffect(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      setTimeout(
        () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
        0
      );
    });
  }, []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div
          className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfdf5,_#e0f2fe_60%,_#f8fafc_95%)]"
          style={{ ["--sidebar-w" as any]: "0px" }}
        >
          <header className="fixed inset-x-0 top-0 z-50">
            <NotebookTopNav />
          </header>

          <main className="min-h-screen pb-8 pt-[var(--header-h)]">
            <div className="app-content app-shell__inner max-w-screen-2xl mx-auto w-full h-full">
              <NotebookPage />
            </div>
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
