import { Box, Button, Stack } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { streamSse } from "../api/sse";
import { describeError } from "../errors";

interface LogViewerProps {
  // SSE path relative to /api, e.g. "/releases/<id>/logs" or "/deployments/<id>/logs".
  path: string;
}

export function LogViewer({ path }: LogViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [errorText, setErrorText] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    setLines([]);
    setStatus("connecting");
    setErrorText(null);

    streamSse(
      path,
      (line) => {
        setStatus("open");
        setLines((prev) => [...prev, line]);
      },
      controller.signal,
    )
      .then(() => setStatus("closed"))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setStatus("error");
          setErrorText(describeError(error));
        }
      });

    return () => controller.abort();
  }, [path]);

  // Auto-scroll to the newest line unless the user scrolled up. Re-runs whenever a
  // line is appended (line count is the trigger).
  useEffect(() => {
    const box = boxRef.current;

    if (box && follow.current && lines.length > 0) {
      box.scrollTop = box.scrollHeight;
    }
  }, [lines.length]);

  const onScroll = () => {
    const box = boxRef.current;

    if (box) {
      follow.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    }
  };

  return (
    <Stack spacing={1}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ fontSize: 12, color: "text.secondary" }}>
          {status} · {lines.length} lines
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" onClick={() => setLines([])}>
          Clear
        </Button>
      </Box>

      <Box
        ref={boxRef}
        onScroll={onScroll}
        sx={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 13,
          lineHeight: 1.5,
          bgcolor: "#0b0e13",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 1.5,
          height: 460,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {lines.map((line, index) => (
          // Log lines have no stable id; index is fine for an append-only list.
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only log buffer
          <div key={index}>{line}</div>
        ))}
        {errorText && <Box sx={{ color: "error.main" }}>{errorText}</Box>}
      </Box>
    </Stack>
  );
}
