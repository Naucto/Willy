import FolderIcon from "@mui/icons-material/Folder";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import { Box } from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { type SyntheticEvent, useCallback, useEffect, useState } from "react";
import { fetchDir } from "../../api/files";
import type { DirEntry } from "../../api/types";
import { joinPath } from "./paths";

const LOADING_SUFFIX = " loading";

// A directories-only, lazily-loaded tree for choosing a move destination. The volume root "/" is a
// selectable node.
export function FolderPicker({
  deploymentId,
  volume,
  value,
  onChange,
}: {
  deploymentId: string;
  volume: string;
  value: string;
  onChange: (dir: string) => void;
}) {
  const [data, setData] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<string[]>(["/"]);

  const load = useCallback(
    (path: string) => {
      void fetchDir(deploymentId, volume, path)
        .then((res) =>
          setData((prev) => ({
            ...prev,
            [path]: res.entries.filter((entry) => entry.type === "dir"),
          })),
        )
        .catch(() => undefined);
    },
    [deploymentId, volume],
  );

  useEffect(() => {
    load("/");
  }, [load]);

  const renderChildren = (dir: string) =>
    (data[dir] ?? []).map((entry) => {
      const itemId = joinPath(dir, entry.name);

      return (
        <TreeItem
          key={itemId}
          itemId={itemId}
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <FolderIcon sx={{ fontSize: 16 }} color="primary" />
              <span>{entry.name}</span>
            </Box>
          }
        >
          {data[itemId] ? (
            renderChildren(itemId)
          ) : (
            <TreeItem itemId={`${itemId}${LOADING_SUFFIX}`} label="Loading…" />
          )}
        </TreeItem>
      );
    });

  return (
    <SimpleTreeView
      selectedItems={value}
      expandedItems={expanded}
      onExpandedItemsChange={(_event, ids) => setExpanded(ids)}
      onItemExpansionToggle={(
        _event: SyntheticEvent | null,
        itemId: string,
        isExpanded: boolean,
      ) => {
        if (isExpanded && !data[itemId] && !itemId.endsWith(LOADING_SUFFIX)) {
          load(itemId);
        }
      }}
      onSelectedItemsChange={(_event, itemId) => {
        if (itemId && !itemId.endsWith(LOADING_SUFFIX)) {
          onChange(itemId);
        }
      }}
    >
      <TreeItem
        itemId="/"
        label={
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <FolderSpecialIcon sx={{ fontSize: 16 }} color="primary" />
            <span>/ (volume root)</span>
          </Box>
        }
      >
        {renderChildren("/")}
      </TreeItem>
    </SimpleTreeView>
  );
}
