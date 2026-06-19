import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import ErrorIcon from "@mui/icons-material/Error";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useClearTask, useClearTasks, useTasks } from "../api/hooks";
import type { Task } from "../api/types";
import { formatRelativeTime } from "../format";

const KIND_LABEL: Record<Task["kind"], string> = {
  DEPLOY: "Deploy",
  BACKUP: "Backup",
  RESTORE: "Restore",
  OFFSITE_PUSH: "Offsite push",
  VOLUME_RESET: "Volume reset",
  PRUNE_IMAGES: "Prune images",
  PRUNE_CONTAINERS: "Prune containers",
};

function isActive(task: Task): boolean {
  return task.status === "PENDING" || task.status === "RUNNING";
}

function TaskRow({ task }: { task: Task }) {
  const active = isActive(task);
  const createdUnix = Math.floor(new Date(task.createdAt).getTime() / 1000);
  const clear = useClearTask();

  return (
    <Box sx={{ px: 2, py: 1.25 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {active ? (
          <CircularProgress size={16} />
        ) : task.status === "SUCCESS" ? (
          <CheckCircleIcon fontSize="small" color="success" />
        ) : (
          <Tooltip title={task.errorMessage ?? "Failed"}>
            <ErrorIcon fontSize="small" color="error" />
          </Tooltip>
        )}
        <Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
          {KIND_LABEL[task.kind]} · {task.title}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
          {formatRelativeTime(createdUnix)}
        </Typography>
        {/* Only finished tasks can be cleared — dismissing a live one would orphan its operation. */}
        {!active &&
          (clear.isPending ? (
            <CircularProgress size={16} sx={{ mr: 0.25 }} />
          ) : (
            <Tooltip title="Clear">
              <IconButton size="small" edge="end" onClick={() => clear.mutate(task.id)}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          ))}
      </Box>
      {active && (
        <LinearProgress
          variant={task.progress === null ? "indeterminate" : "determinate"}
          value={task.progress ?? 0}
          sx={{ mt: 0.75, height: 5, borderRadius: 1 }}
        />
      )}
    </Box>
  );
}

export function ActivityMenu() {
  const { data: tasks } = useTasks("recent");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const clearAll = useClearTasks();

  const list = tasks ?? [];
  const activeCount = list.filter(isActive).length;
  const hasFinished = list.some((task) => !isActive(task));

  return (
    <>
      <Tooltip title="Activity">
        <IconButton color="inherit" onClick={(event) => setAnchor(event.currentTarget)}>
          <Badge badgeContent={activeCount} color="primary">
            <Box sx={{ position: "relative", display: "flex" }}>
              <NotificationsNoneIcon />
              {activeCount > 0 && (
                <CircularProgress
                  size={32}
                  thickness={3}
                  sx={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    mt: "-16px",
                    ml: "-16px",
                  }}
                />
              )}
            </Box>
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 460 } } }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Activity
          </Typography>
          {hasFinished && (
            <Button
              size="small"
              color="inherit"
              disabled={clearAll.isPending}
              onClick={() => clearAll.mutate()}
            >
              Clear all
            </Button>
          )}
        </Box>

        {list.length > 0 ? (
          <Stack divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}>
            {list.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </Stack>
        ) : (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              No recent activity.
            </Typography>
          </Box>
        )}
      </Popover>
    </>
  );
}
