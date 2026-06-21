import FolderIcon from "@mui/icons-material/Folder";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import LinkIcon from "@mui/icons-material/Link";
import { Box } from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { type DragEvent, type MouseEvent, type SyntheticEvent, useState } from "react";
import type { DirEntry } from "../../api/types";
import { baseOf, dirOf, joinPath } from "./paths";

const LOADING_SUFFIX = " loading";
const DRAG_TYPE = "application/x-willy-path";

function entryIcon(type: DirEntry["type"]) {
  if (type === "dir") {
    return <FolderIcon sx={{ fontSize: 16 }} color="primary" />;
  }

  if (type === "symlink") {
    return <LinkIcon sx={{ fontSize: 16 }} />;
  }

  return <InsertDriveFileOutlinedIcon sx={{ fontSize: 16 }} />;
}

export function FileTree({
  treeData,
  expanded,
  selectedPath,
  canOperate,
  onExpandedChange,
  onLoadDir,
  onOpenFile,
  onSelectDir,
  onContextMenu,
  onMoveInto,
}: {
  treeData: Record<string, DirEntry[]>;
  expanded: string[];
  selectedPath: string | null;
  canOperate: boolean;
  onExpandedChange: (ids: string[]) => void;
  onLoadDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  onSelectDir: (path: string) => void;
  onContextMenu: (event: MouseEvent, path: string, entry: DirEntry | null) => void;
  onMoveInto: (source: string, destDir: string) => void;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);

  const entryFor = (itemId: string): DirEntry | undefined =>
    treeData[dirOf(itemId)]?.find((entry) => entry.name === baseOf(itemId));

  const startDrag = (event: DragEvent, itemId: string) => {
    event.dataTransfer.setData(DRAG_TYPE, itemId);
    event.dataTransfer.effectAllowed = "move";
  };

  // Drop onto a directory (or the root container) moves the dragged item into it.
  const dropInto = (event: DragEvent, destDir: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    const source = event.dataTransfer.getData(DRAG_TYPE);

    if (source) {
      onMoveInto(source, destDir);
    }
  };

  const allowDrop = (event: DragEvent, destPath: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOver(destPath);
  };

  const renderEntries = (dirPath: string) =>
    (treeData[dirPath] ?? []).map((entry) => {
      const itemId = joinPath(dirPath, entry.name);
      const isDir = entry.type === "dir";
      const dropProps =
        canOperate && isDir
          ? {
              onDragOver: (event: DragEvent) => allowDrop(event, itemId),
              onDragLeave: () => setDragOver((current) => (current === itemId ? null : current)),
              onDrop: (event: DragEvent) => dropInto(event, itemId),
            }
          : {};

      const label = (
        <Box
          draggable={canOperate}
          onDragStart={(event) => startDrag(event, itemId)}
          onContextMenu={(event) => onContextMenu(event, itemId, entry)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            py: 0.25,
            borderRadius: 0.5,
            bgcolor: dragOver === itemId ? "action.selected" : "transparent",
          }}
          {...dropProps}
        >
          {entryIcon(entry.type)}
          <span>{entry.name}</span>
        </Box>
      );

      if (isDir) {
        const loaded = treeData[itemId];

        return (
          <TreeItem key={itemId} itemId={itemId} label={label}>
            {loaded ? (
              renderEntries(itemId)
            ) : (
              <TreeItem itemId={`${itemId}${LOADING_SUFFIX}`} label="Loading…" />
            )}
          </TreeItem>
        );
      }

      return <TreeItem key={itemId} itemId={itemId} label={label} />;
    });

  const handleExpansionToggle = (
    _event: SyntheticEvent | null,
    itemId: string,
    isExpanded: boolean,
  ) => {
    if (isExpanded && !treeData[itemId] && !itemId.endsWith(LOADING_SUFFIX)) {
      onLoadDir(itemId);
    }
  };

  const handleItemClick = (_event: SyntheticEvent, itemId: string) => {
    if (itemId.endsWith(LOADING_SUFFIX)) {
      return;
    }

    const entry = entryFor(itemId);

    if (entry?.type === "dir") {
      onSelectDir(itemId);

      return;
    }

    if (entry) {
      onOpenFile(itemId);
    }
  };

  return (
    <Box
      onContextMenu={(event) => {
        if (event.target === event.currentTarget) {
          onContextMenu(event, "/", null);
        }
      }}
      // Dropping on empty space (not over a folder row) moves the item to the volume root.
      onDragOver={(event) => {
        if (canOperate && event.target === event.currentTarget) {
          allowDrop(event, "/");
        }
      }}
      onDrop={(event) => {
        if (canOperate && event.target === event.currentTarget) {
          dropInto(event, "/");
        }
      }}
      sx={{
        height: "100%",
        overflow: "auto",
        py: 1,
        outline: dragOver === "/" ? "2px dashed" : "none",
        outlineColor: "primary.main",
        outlineOffset: -2,
      }}
    >
      <SimpleTreeView
        expandedItems={expanded}
        selectedItems={selectedPath}
        onExpandedItemsChange={(_event, ids) => onExpandedChange(ids)}
        onItemExpansionToggle={handleExpansionToggle}
        onItemClick={handleItemClick}
      >
        {renderEntries("/")}
      </SimpleTreeView>
    </Box>
  );
}
