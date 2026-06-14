import { createServer } from "node:http";
import { describeBackend } from "./version";

const port = Number(process.env.PORT ?? 3000);

// Minimal placeholder server so the container stays healthy until the NestJS
// control plane (HTTP + WS + Drizzle) lands in Phase 2.
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`${describeBackend()} — not implemented yet\n`);
});

server.listen(port, () => {
  console.log(`${describeBackend()} listening on :${port}`);
});
