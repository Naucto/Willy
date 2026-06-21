import Editor from "@monaco-editor/react";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from "@mui/material";
import type { KeyboardEvent } from "react";
import { OperateButton } from "../OperateButton";
import { formatBytes } from "./paths";
import type { OpenFile } from "./types";
import "./monaco-setup";

export function FileEditorTabs({
  files,
  activePath,
  canOperate,
  onActivate,
  onClose,
  onChange,
  onSave,
  onDownload,
}: {
  files: OpenFile[];
  activePath: string | null;
  canOperate: boolean;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onSave: (path: string) => void;
  onDownload: (path: string) => void;
}) {
  const theme = useTheme();
  const active = files.find((file) => file.path === activePath) ?? null;

  if (files.length === 0) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: "100%", color: "text.secondary" }}>
        <Typography variant="body2">Select a file from the tree to view or edit it.</Typography>
      </Box>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();

      if (active && canOperate && !active.isBinary) {
        onSave(active.path);
      }
    }
  };

  return (
    <Box
      onKeyDown={onKeyDown}
      sx={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}
    >
      <Tabs
        value={activePath ?? false}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 40, borderBottom: 1, borderColor: "divider" }}
      >
        {files.map((file) => (
          <Tab
            key={file.path}
            value={file.path}
            onClick={() => onActivate(file.path)}
            sx={{ minHeight: 40, textTransform: "none", pr: 1 }}
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <span>
                  {file.content !== file.original ? "● " : ""}
                  {file.name}
                </span>
                <IconButton
                  size="small"
                  component="span"
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(file.path);
                  }}
                  sx={{ p: 0.25 }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            }
          />
        ))}
      </Tabs>

      {active && (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: "center", px: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}
        >
          <Typography
            variant="caption"
            sx={{ fontFamily: "monospace", flexGrow: 1, minWidth: 0 }}
            noWrap
          >
            {active.path}
          </Typography>
          <Chip
            size="small"
            label={`${active.mode} · ${formatBytes(active.size)}`}
            variant="outlined"
          />
          <Button size="small" startIcon={<DownloadIcon />} onClick={() => onDownload(active.path)}>
            Download
          </Button>
          {!active.isBinary && (
            <OperateButton
              size="small"
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={active.loading || active.content === active.original}
              onClick={() => onSave(active.path)}
            >
              Save
            </OperateButton>
          )}
        </Stack>
      )}

      <Box sx={{ flexGrow: 1, minHeight: 0, position: "relative" }}>
        {active?.loading && (
          <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
            <CircularProgress />
          </Box>
        )}

        {active && !active.loading && active.error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {active.error}
          </Alert>
        )}

        {active && !active.loading && !active.error && active.isBinary && (
          <Box sx={{ display: "grid", placeItems: "center", height: "100%", p: 3 }}>
            <Stack spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="body2" color="text.secondary">
                This looks like a binary file ({formatBytes(active.size)}). Download it to inspect.
              </Typography>
              <Button startIcon={<DownloadIcon />} onClick={() => onDownload(active.path)}>
                Download
              </Button>
            </Stack>
          </Box>
        )}

        {active && !active.loading && !active.error && !active.isBinary && (
          <Editor
            key={active.path}
            path={active.path}
            language={active.language}
            value={active.content}
            theme={theme.palette.mode === "dark" ? "vs-dark" : "light"}
            onChange={(value) => onChange(active.path, value ?? "")}
            options={{
              readOnly: !canOperate,
              minimap: { enabled: true },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
            }}
          />
        )}
      </Box>
    </Box>
  );
}
