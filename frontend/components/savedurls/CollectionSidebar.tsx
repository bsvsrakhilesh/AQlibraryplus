import React, { useEffect, useMemo, useRef } from "react";
import { Collection } from "../../lib/types";

interface CollectionSidebarProps {
  collections: Collection[];
  collectionCounts: Record<string, number>;
  totalUrlCount: number;
  selectedCollectionId?: string;
  onSelect: (id: string | undefined) => void;
  onCreateClick?: () => void;
  onRenameClick?: (collection: Collection) => void;
  onDeleteClick?: (collection: Collection) => void;
}

const CollectionFilterMenu: React.FC<CollectionSidebarProps> = ({
  collections,
  collectionCounts,
  totalUrlCount,
  selectedCollectionId,
  onSelect,
  onCreateClick,
  onRenameClick,
  onDeleteClick,
}) => {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const selectedCollection = useMemo(
    () => collections.find((c) => c.id === selectedCollectionId),
    [collections, selectedCollectionId],
  );

  const canDeleteSelected =
    !!selectedCollection && selectedCollection.id !== "c_general";
  const closeMenu = () => menuRef.current?.removeAttribute("open");
  const selectCollection = (id: string | undefined) => {
    onSelect(id);
    closeMenu();
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
        menuRef.current?.querySelector("summary")?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={menuRef} className="saved-urls-collection-menu">
      <summary title="Filter saved URLs by an optional collection">
        <span className="saved-urls-collection-menu__label">Collection:</span>
        <span className="saved-urls-collection-menu__value">
          {selectedCollection?.name ?? "All saved URLs"}
        </span>
        <span className="saved-urls-collection-menu__count">
          {selectedCollection
            ? (collectionCounts[selectedCollection.id] ?? 0)
            : totalUrlCount}
        </span>
      </summary>

      <div className="saved-urls-collection-menu__panel">
        <div className="saved-urls-collection-menu__heading">
          <div>
            <strong>Filter by collection</strong>
            <span>Optional reusable grouping</span>
          </div>
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onCreateClick?.();
            }}
          >
            New collection
          </button>
        </div>

        <div className="saved-urls-collection-menu__options">
          <button
            type="button"
            aria-pressed={!selectedCollectionId}
            onClick={() => selectCollection(undefined)}
          >
            <span>All saved URLs</span>
            <small>{totalUrlCount}</small>
          </button>
          {collections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              aria-pressed={selectedCollectionId === collection.id}
              onClick={() => selectCollection(collection.id)}
              title={collection.name}
            >
              <span>{collection.name}</span>
              <small>{collectionCounts[collection.id] ?? 0}</small>
            </button>
          ))}
        </div>

        {selectedCollection && (
          <div className="saved-urls-collection-menu__footer">
            <span>Manage “{selectedCollection.name}”</span>
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onRenameClick?.(selectedCollection);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onDeleteClick?.(selectedCollection);
              }}
              disabled={!canDeleteSelected}
              className="is-danger"
              title={
                canDeleteSelected
                  ? "Delete collection"
                  : "The default General collection is protected"
              }
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </details>
  );
};

export default CollectionFilterMenu;
