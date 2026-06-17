import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useSnackbar } from "notistack";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAdminImages, useDeleteAdminImage, usePruneImages } from "../api/hooks";
import type { AdminImage } from "../api/types";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { describeError } from "../errors";
import { formatBytes, formatRelativeTime } from "../format";

// Visually distinct colors for the stacked bar segments (MUI-friendly palette).
const SEGMENT_COLORS = [
  "#4C9BE8",
  "#E8734C",
  "#4CE87A",
  "#E8C34C",
  "#A64CE8",
  "#4CE8D8",
  "#E84C7A",
  "#8BE84C",
  "#E84CC3",
  "#4C6AE8",
];
const OTHER_COLOR = "#9E9E9E";
// Images whose share of total disk falls below this threshold are collapsed into "Other".
const MIN_SEGMENT_PCT = 1.5;

interface Segment {
  id: string;
  label: string;
  size: number;
  pct: number;
  color: string;
}

function buildSegments(images: AdminImage[]): Segment[] {
  if (images.length === 0) return [];

  const sorted = [...images].sort((a, b) => b.size - a.size);
  const totalSize = sorted.reduce((sum, img) => sum + img.size, 0);
  if (totalSize === 0) return [];

  const significant: Segment[] = [];
  let otherSize = 0;

  for (const [i, img] of sorted.entries()) {
    const pct = (img.size / totalSize) * 100;
    const label = img.repoTags[0] ?? img.id.slice(7, 19);

    if (pct >= MIN_SEGMENT_PCT) {
      significant.push({
        id: img.id,
        label,
        size: img.size,
        pct,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length] ?? OTHER_COLOR,
      });
    } else {
      otherSize += img.size;
    }
  }

  if (otherSize > 0) {
    significant.push({
      id: "__other__",
      label: "Other",
      size: otherSize,
      pct: (otherSize / totalSize) * 100,
      color: OTHER_COLOR,
    });
  }

  return significant;
}

function ImageSizeChart({ images }: { images: AdminImage[] }) {
  const segments = buildSegments(images);

  if (segments.length === 0) return null;

  return (
    <Stack spacing={1.5}>
      <Box
        sx={{
          display: "flex",
          width: "100%",
          height: 28,
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        {segments.map((seg) => (
          <Tooltip
            key={seg.id}
            title={`${seg.label}: ${formatBytes(seg.size)}`}
            arrow
            placement="top"
          >
            <Box
              sx={{
                width: `${seg.pct}%`,
                bgcolor: seg.color,
                cursor: "default",
                transition: "filter 0.15s",
                "&:hover": { filter: "brightness(1.18)" },
              }}
            />
          </Tooltip>
        ))}
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
        {segments.map((seg) => (
          <Box key={seg.id} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "2px",
                bgcolor: seg.color,
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" noWrap sx={{ maxWidth: 200 }}>
              {seg.label}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
              {formatBytes(seg.size)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Stack>
  );
}

export function ImagesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [toDelete, setToDelete] = useState<AdminImage | null>(null);
  const [pruneConfirm, setPruneConfirm] = useState(false);

  const { data: images, isLoading, error } = useAdminImages();
  const deleteImage = useDeleteAdminImage();
  const pruneImages = usePruneImages();

  const onDelete = async () => {
    if (!toDelete) return;

    try {
      await deleteImage.mutateAsync(toDelete.id);
      enqueueSnackbar("Image removed", { variant: "success" });
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    } finally {
      setToDelete(null);
    }
  };

  const onPrune = async () => {
    try {
      const result = await pruneImages.mutateAsync();
      enqueueSnackbar(
        `Pruned ${result.itemsRemoved} image(s) — ${formatBytes(result.spaceReclaimedBytes)} reclaimed`,
        {
          variant: "success",
        },
      );
    } catch (caught) {
      enqueueSnackbar(describeError(caught), { variant: "error" });
    } finally {
      setPruneConfirm(false);
    }
  };

  const columns: GridColDef<AdminImage>[] = [
    {
      field: "repoTags",
      headerName: "Tags",
      flex: 1,
      minWidth: 260,
      sortable: false,
      renderCell: (params) => {
        const tags: string[] = params.value as string[];

        if (tags.length === 0) {
          return (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              &lt;none&gt;
            </Typography>
          );
        }

        return (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, py: 0.5 }}>
            {tags.map((tag) => (
              <Chip key={tag} label={tag} size="small" variant="outlined" />
            ))}
          </Box>
        );
      },
    },
    {
      field: "size",
      headerName: "Size",
      width: 90,
      valueFormatter: (value: number) => formatBytes(value),
    },
    {
      field: "virtualSize",
      headerName: "Virtual",
      width: 90,
      valueFormatter: (value: number) => formatBytes(value),
    },
    {
      field: "created",
      headerName: "Created",
      width: 120,
      valueFormatter: (value: number) => formatRelativeTime(value),
    },
    {
      field: "deployments",
      headerName: "Deployments",
      width: 200,
      sortable: false,
      renderCell: (params) => {
        const deps = params.row.deployments;

        if (deps.length === 0) {
          return (
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              —
            </Typography>
          );
        }

        return (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, py: 0.5 }}>
            {deps.map((dep) => (
              <Chip
                key={dep.id}
                label={dep.name}
                size="small"
                component={RouterLink}
                to={`/deployments/${dep.id}`}
                clickable
              />
            ))}
          </Box>
        );
      },
    },
    {
      field: "activeContainersCount",
      headerName: "Containers",
      width: 100,
      align: "center",
      headerAlign: "center",
    },
    {
      field: "actions",
      headerName: "",
      width: 90,
      sortable: false,
      filterable: false,
      align: "right",
      renderCell: (params) => {
        const { deployments: deps, activeContainersCount } = params.row;
        const inUse = activeContainersCount > 0;
        const firstDep = deps[0];

        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {firstDep && (
              <Tooltip title="View build logs">
                <IconButton
                  size="small"
                  component={RouterLink}
                  to={`/deployments/${firstDep.id}/build`}
                >
                  <ArticleOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={inUse ? "In use by a container" : "Delete image"}>
              <span>
                <IconButton
                  size="small"
                  disabled={inUse}
                  onClick={inUse ? undefined : () => setToDelete(params.row)}
                  color="error"
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        );
      },
    },
  ];

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="h5">Images</Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="outlined" onClick={() => setPruneConfirm(true)}>
          Prune dangling
        </Button>
      </Box>

      {error && <Alert severity="error">{describeError(error)}</Alert>}

      {images && images.length > 0 && (
        <Box>
          <Typography variant="overline" sx={{ color: "text.secondary" }}>
            Disk usage
          </Typography>
          <Box sx={{ mt: 1 }}>
            <ImageSizeChart images={images} />
          </Box>
        </Box>
      )}

      <Box sx={{ height: 540 }}>
        <DataGrid
          rows={images ?? []}
          columns={columns}
          loading={isLoading}
          getRowId={(row) => row.id}
          showToolbar
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          getRowHeight={() => "auto"}
          sx={{ border: 0 }}
        />
      </Box>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete image"
        message={`Remove image ${toDelete?.repoTags[0] ?? toDelete?.id.slice(7, 19)}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void onDelete()}
        onCancel={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={pruneConfirm}
        title="Prune dangling images"
        message="Remove all untagged image layers left behind by rebuilds? Space used by active deployment images will not be reclaimed."
        confirmLabel="Prune"
        onConfirm={() => void onPrune()}
        onCancel={() => setPruneConfirm(false)}
      />
    </Stack>
  );
}
