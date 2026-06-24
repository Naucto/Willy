import { Alert, Box, Button, Stack } from "@mui/material";
import Anser from "anser";
import { type CSSProperties, memo, useEffect, useMemo, useRef, useState } from "react";
import { streamSse } from "../api/sse";
import { describeError } from "../errors";
import { interpretLogLine } from "./logStream";

// Translate one anser segment's color + decorations into inline styles. Colors come back as
// "r, g, b" triples (use_classes: false); decorations are SGR attributes like bold/underline.
function segmentStyle(segment: Anser.AnserJsonEntry): CSSProperties {
  const style: CSSProperties = {};

  if (segment.fg) {
    style.color = `rgb(${segment.fg})`;
  }

  if (segment.bg) {
    style.backgroundColor = `rgb(${segment.bg})`;
  }

  for (const decoration of segment.decorations) {
    if (decoration === "bold") {
      style.fontWeight = 700;
    } else if (decoration === "dim") {
      style.opacity = 0.7;
    } else if (decoration === "italic") {
      style.fontStyle = "italic";
    } else if (decoration === "underline") {
      style.textDecoration = "underline";
    } else if (decoration === "strikethrough") {
      style.textDecoration = "line-through";
    }
  }

  return style;
}

// One rendered log line with ANSI SGR codes turned into styled spans. Memoized so the append-only
// list only parses newly-arrived lines rather than the whole buffer on every render.
const LogLine = memo(function LogLine({ text }: { text: string }) {
  const segments = useMemo(
    () => Anser.ansiToJson(text, { json: true, use_classes: false, remove_empty: true }),
    [text],
  );

  return (
    <div>
      {segments.map((segment, index) => (
        // Segments have no stable id; index within an immutable line is fine.
        // biome-ignore lint/suspicious/noArrayIndexKey: stable within a fixed line
        <span key={index} style={segmentStyle(segment)}>
          {segment.content}
        </span>
      ))}
    </div>
  );
});

interface LogViewerProps {
  // SSE path relative to /api, e.g. "/releases/<id>/logs" or "/deployments/<id>/logs".
  path: string;
}

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
  // The backend reports the live tail froze (and recovered); the banner reflects it until dismissed.
  const [stalled, setStalled] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    const controller = new AbortController();

    // A new stream (path change) starts clean: any prior freeze/dismissal no longer applies.
    setStalled(false);
    setBannerDismissed(false);

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
            (frame) => {
              const { kind, text } = interpretLogLine(frame);

              if (kind === "eof") {
                endedCleanly = true;

                return;
              }

              if (kind === "stalled") {
                setStalled(true);
                setBannerDismissed(false);

                return;
              }

              if (kind === "live") {
                setStalled(false);

                return;
              }

              attempts = 0;
              setStatus("open");
              setLines((prev) => [...prev, text]);
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
            setBannerDismissed(false);

            return;
          }

          attempts += 1;

          if (attempts > MAX_RECONNECTS) {
            setStatus("error");
            setErrorText(describeError(error));
            setBannerDismissed(false);

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

  const isError = status === "error";
  const showBanner = (isError || stalled) && !bannerDismissed;

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
        {showBanner && (
          <Alert
            severity={isError ? "error" : "warning"}
            variant="filled"
            onClose={() => setBannerDismissed(true)}
            // Stay visible while the log scrolls beneath it.
            sx={{ position: "sticky", top: 0, zIndex: 1, mb: 1 }}
          >
            {isError
              ? (errorText ?? "Log stream error.")
              : "Live tail stalled — attempting to reconnect…"}
          </Alert>
        )}

        {lines.map((line, index) => (
          // Log lines have no stable id; index is fine for an append-only list.
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only log buffer
          <LogLine key={index} text={line} />
        ))}
      </Box>
    </Stack>
  );
}
