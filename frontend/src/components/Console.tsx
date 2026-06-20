import "@xterm/xterm/css/xterm.css";
import { Box, Stack } from "@mui/material";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { api, unwrap } from "../api/client";
import { describeError } from "../errors";

type Status = "connecting" | "open" | "closed" | "error";

export function Console({
  deploymentId,
  container,
}: {
  deploymentId: string;
  container?: string | undefined;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let term: Terminal | null = null;
    let socket: WebSocket | null = null;
    let fit: FitAddon | null = null;
    let disposed = false;

    const refit = () => {
      try {
        fit?.fit();
      } catch {
        // terminal not yet sized
      }
    };

    const start = async () => {
      const { ticket } = unwrap(await api.POST("/streams/ticket"));

      if (disposed || !mountRef.current) {
        return;
      }

      term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        theme: { background: "#0b0e13" },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(mountRef.current);
      refit();

      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const containerParam = container ? `&container=${encodeURIComponent(container)}` : "";
      const url = `${scheme}://${window.location.host}/api/console/${deploymentId}?ticket=${encodeURIComponent(ticket)}${containerParam}`;
      socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";

      const sendResize = () => {
        if (socket?.readyState === WebSocket.OPEN && term) {
          socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      };

      socket.onopen = () => {
        setStatus("open");
        sendResize();
      };
      socket.onmessage = (event) => {
        term?.write(typeof event.data === "string" ? event.data : new Uint8Array(event.data));
      };
      socket.onclose = () => setStatus((prev) => (prev === "error" ? prev : "closed"));
      socket.onerror = () => {
        setStatus("error");
        setError("connection error");
      };

      term.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(new TextEncoder().encode(data));
        }
      });
      term.onResize(() => sendResize());
      window.addEventListener("resize", refit);
    };

    start().catch((caught: unknown) => {
      setStatus("error");
      setError(describeError(caught));
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", refit);
      socket?.close();
      term?.dispose();
    };
  }, [deploymentId, container]);

  return (
    <Stack spacing={1}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box sx={{ fontSize: 12, color: "text.secondary" }}>
          {status} · interactive /bin/sh in the running container
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        {error && <Box sx={{ fontSize: 12, color: "error.main" }}>{error}</Box>}
      </Box>

      <Box
        ref={mountRef}
        sx={{
          // Fill the viewport (minus the AppBar + page/header padding); the FitAddon re-fits on
          // window resize, so xterm tracks this height.
          height: "calc(100vh - 240px)",
          minHeight: 360,
          bgcolor: "#0b0e13",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 1,
          "& .xterm": { height: "100%" },
        }}
      />
    </Stack>
  );
}
