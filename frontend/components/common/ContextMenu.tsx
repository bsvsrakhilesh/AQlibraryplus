// components/common/ContextMenu.tsx
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

const TYPEAHEAD_RESET_MS = 500;

function isSelectableItem(
  item: MenuItem,
): item is Extract<MenuItem, { type: "item" }> {
  return item.type === "item" && !item.disabled;
}

const ContextMenu: React.FC<Props> = ({ open, x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const typeaheadBufferRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);

  const [position, setPosition] = useState({ left: x, top: y });
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const selectableIndexes = useMemo(
    () =>
      items.reduce<number[]>((acc, item, index) => {
        if (isSelectableItem(item)) acc.push(index);
        return acc;
      }, []),
    [items],
  );

  const firstSelectableIndex = selectableIndexes[0] ?? -1;
  const lastSelectableIndex =
    selectableIndexes[selectableIndexes.length - 1] ?? -1;

  const clearTypeahead = () => {
    typeaheadBufferRef.current = "";
    if (typeaheadTimerRef.current !== null) {
      window.clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current = null;
    }
  };

  const focusIndex = (index: number) => {
    if (index < 0) {
      menuRef.current?.focus();
      return;
    }
    itemRefs.current[index]?.focus();
  };

  const activateIndex = (index: number) => {
    const item = items[index];
    if (!item || item.type !== "item" || item.disabled) return;
    item.onSelect();
    onClose();
  };

  const moveActive = (direction: 1 | -1) => {
    if (!selectableIndexes.length) return;

    const currentPos = selectableIndexes.indexOf(activeIndex);
    const safeCurrentPos = currentPos >= 0 ? currentPos : 0;
    const nextPos =
      (safeCurrentPos + direction + selectableIndexes.length) %
      selectableIndexes.length;
    const nextIndex = selectableIndexes[nextPos] ?? -1;

    setActiveIndex(nextIndex);
    focusIndex(nextIndex);
  };

  const moveToBoundary = (target: "first" | "last") => {
    const nextIndex =
      target === "first" ? firstSelectableIndex : lastSelectableIndex;
    setActiveIndex(nextIndex);
    focusIndex(nextIndex);
  };

  const handleTypeahead = (key: string) => {
    if (!selectableIndexes.length) return;

    const nextBuffer = `${typeaheadBufferRef.current}${key}`.toLowerCase();
    typeaheadBufferRef.current = nextBuffer;

    if (typeaheadTimerRef.current !== null) {
      window.clearTimeout(typeaheadTimerRef.current);
    }

    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadBufferRef.current = "";
      typeaheadTimerRef.current = null;
    }, TYPEAHEAD_RESET_MS);

    const startPos = Math.max(0, selectableIndexes.indexOf(activeIndex));
    const orderedIndexes = [
      ...selectableIndexes.slice(startPos + 1),
      ...selectableIndexes.slice(0, startPos + 1),
    ];

    const matchIndex = orderedIndexes.find((itemIndex) => {
      const item = items[itemIndex];
      return (
        item?.type === "item" &&
        !item.disabled &&
        item.label.toLowerCase().startsWith(nextBuffer)
      );
    });

    if (typeof matchIndex === "number") {
      setActiveIndex(matchIndex);
      focusIndex(matchIndex);
    }
  };

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

  // Initial focus + focus restore
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    setActiveIndex(firstSelectableIndex);

    const raf = window.requestAnimationFrame(() => {
      if (firstSelectableIndex >= 0) {
        focusIndex(firstSelectableIndex);
      } else {
        menuRef.current?.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(raf);
      clearTypeahead();
      restoreFocusRef.current?.focus?.();
    };
  }, [open, firstSelectableIndex]);

  // ESC / scroll / resize close
  useEffect(() => {
    if (!open) return;

    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onScroll = () => onClose();
    const onResize = () => onClose();

    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menu = (
    <div
      className="fixed inset-0 z-[9999]"
      onMouseDown={() => onClose()}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        tabIndex={-1}
        className="absolute z-[10000] min-w-[180px] max-w-xs rounded-md border border-neutral-200/70 bg-white/95 shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/95"
        style={{ top: position.top, left: position.left }}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          switch (e.key) {
            case "ArrowDown":
              e.preventDefault();
              moveActive(1);
              return;
            case "ArrowUp":
              e.preventDefault();
              moveActive(-1);
              return;
            case "Home":
              e.preventDefault();
              moveToBoundary("first");
              return;
            case "End":
              e.preventDefault();
              moveToBoundary("last");
              return;
            case "Enter":
            case " ":
              e.preventDefault();
              if (activeIndex >= 0) activateIndex(activeIndex);
              return;
            case "Tab":
              e.preventDefault();
              onClose();
              return;
            default:
              if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                handleTypeahead(e.key);
              }
          }
        }}
      >
        <div className="py-1 text-[13px] text-neutral-800 dark:text-neutral-100">
          {items.map((it, idx) => {
            if (it.type === "separator") {
              return (
                <div
                  key={`sep-${idx}`}
                  role="separator"
                  className="my-1 border-t border-neutral-200 dark:border-neutral-700"
                />
              );
            }

            if (it.type === "label") {
              return (
                <div
                  key={`label-${idx}`}
                  role="presentation"
                  className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500"
                >
                  {it.label}
                </div>
              );
            }

            const disabled = it.disabled;
            const isActive = idx === activeIndex;

            const handleClick = () => {
              if (disabled) return;
              it.onSelect();
              onClose();
            };

            return (
              <button
                key={it.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={isActive ? 0 : -1}
                aria-disabled={disabled || undefined}
                onClick={handleClick}
                onMouseEnter={() => {
                  if (!disabled) setActiveIndex(idx);
                }}
                onFocus={() => {
                  if (!disabled) setActiveIndex(idx);
                }}
                disabled={disabled}
                className={[
                  "w-full flex items-center justify-between px-3 py-1.5 text-left text-[13px]",
                  "focus:outline-none",
                  isActive
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "bg-transparent",
                  disabled
                    ? "cursor-not-allowed opacity-50"
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
