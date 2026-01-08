// components/common/ContextMenu.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      type: "item";
      id: string;
      label: string;
      onSelect: () => void;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: "separator" }
  | { type: "label"; label: string };

type Props = {
  open: boolean;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

const ContextMenu: React.FC<Props> = ({ open, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Start from the cursor position when menu opens
  useLayoutEffect(() => {
    if (!open) return;
    setPosition({ left: x, top: y });
  }, [open, x, y]);

  // Clamp the menu inside viewport
  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;

    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();

    let left = position.left;
    let top = position.top;

    if (left + rect.width > innerWidth)
      left = Math.max(4, innerWidth - rect.width - 4);
    if (top + rect.height > innerHeight)
      top = Math.max(4, innerHeight - rect.height - 4);

    if (left !== position.left || top !== position.top)
      setPosition({ left, top });
  }, [open, position.left, position.top]);

  // ESC / scroll / resize close
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    const onResize = () => onClose();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menu = (
    <div
      className="fixed inset-0 z-[9999]"
      // left click anywhere outside closes
      onMouseDown={() => onClose()}
      // right click anywhere outside closes + blocks browser menu
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className="absolute z-[10000] min-w-[180px] max-w-xs rounded-md border border-neutral-200/70 bg-white/95 shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:bg-neutral-900/95 dark:border-neutral-700"
        style={{ top: position.top, left: position.left }}
        // prevent backdrop from closing when interacting with menu
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="py-1 text-[13px] text-neutral-800 dark:text-neutral-100">
          {items.map((it, idx) => {
            if (it.type === "separator") {
              return (
                <div
                  key={`sep-${idx}`}
                  className="my-1 border-t border-neutral-200 dark:border-neutral-700"
                />
              );
            }

            if (it.type === "label") {
              return (
                <div
                  key={`label-${idx}`}
                  className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500"
                >
                  {it.label}
                </div>
              );
            }

            const disabled = it.disabled;
            const handleClick = () => {
              if (disabled) return;
              it.onSelect();
              onClose();
            };

            return (
              <button
                key={it.id}
                type="button"
                onClick={handleClick}
                disabled={disabled}
                className={[
                  "w-full flex items-center justify-between px-3 py-1.5 text-left text-[13px]",
                  "focus:outline-none focus:bg-neutral-100 dark:focus:bg-neutral-800",
                  disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800",
                  it.danger
                    ? "text-red-600"
                    : "text-neutral-800 dark:text-neutral-100",
                ].join(" ")}
              >
                <span className="truncate">{it.label}</span>
                {it.shortcut && (
                  <span className="ml-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                    {it.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(menu, document.body);
};

export default ContextMenu;
