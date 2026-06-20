import { Box, Button, Stack } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { streamSse } from "../api/sse";
import { describeError } from "../errors";

interface LogViewerProps {
  // SSE path relative to /api, e.g. "/releases/<id>/logs" or "/deployments/<id>/logs".
  path: string;
}

// Matches the backend's LOG_STREAM_EOF marker: the last frame of a build-log stream. Its arrival
// means the build finished — so any subsequent connection close is expected, not an error.
const LOG_STREAM_EOF = "__willy_eof__";

// A build's last act, `docker compose up`, creates the project's bridge network and can reset the
// in-flight SSE connection (it rides the same edge network). The durable log store replays full
// history on every connect, so we transparently reconnect through such a drop instead of surfacing
// a "network error". Capped so a genuinely dead stream still settles on an error.
const MAX_RECONNECTS = 5;
const RECONNECT_DELAY_MS = 500;

export function LogViewer({ path }: LogViewerProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"connecting" | "open" | "reconnecting" | "closed" | "error">(
    "connecting",
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    const controller = new AbortController();

    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    void (async () => {
      // Reset to zero whenever a line arrives, so each distinct drop gets a fresh retry budget
      // rather than exhausting one shared across an entire long build.
      let attempts = 0;

      while (!controller.signal.aborted) {
        let endedCleanly = false;
        // Every connect replays history from the start, so clear to avoid duplicating it.
        setLines([]);
        setErrorText(null);
        setStatus(attempts === 0 ? "connecting" : "reconnecting");

        try {
          await streamSse(
            path,
            (line) => {
              // A stray non-printable byte can precede the sentinel on the wire; strip anything
              // outside printable ASCII before matching so the marker never shows as a log line.
              if (line.replace(/[^\x20-\x7e]/g, "").trim() === LOG_STREAM_EOF) {
                endedCleanly = true;

                return;
              }

              attempts = 0;
              setStatus("open");
              setLines((prev) => [...prev, line]);
            },
            controller.signal,
          );

          // Clean end: the build's EOF, or a runtime stream whose container stopped.
          setStatus("closed");

          return;
        } catch (error) {
          if (controller.signal.aborted || endedCleanly) {
            setStatus("closed");

            return;
          }

          // A non-OK HTTP response (e.g. auth expired, release gone) won't recover by retrying.
          if (error instanceof Error && error.message.startsWith("log stream failed")) {
            setStatus("error");
            setErrorText(describeError(error));

            return;
          }

          attempts += 1;

          if (attempts > MAX_RECONNECTS) {
            setStatus("error");
            setErrorText(describeError(error));

            return;
          }

          await delay(RECONNECT_DELAY_MS * attempts);
        }
      }
    })();

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
          // Fill the viewport (minus the AppBar + page/header padding) so logs aren't cramped.
          height: "calc(100vh - 240px)",
          minHeight: 360,
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
