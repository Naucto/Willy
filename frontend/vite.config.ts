import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// In the watch profile the SPA runs on Vite's dev server; /api is proxied to the
// running control plane. Default target is the compose stack behind Traefik
// (mkcert TLS, hence secure:false). Override with VITE_API_PROXY when running the
// backend directly (e.g. http://localhost:3000).
const apiProxyTarget = process.env.VITE_API_PROXY ?? "https://willy.localhost";

export default defineConfig({
  plugins: [react()],
  build: {
    // The only chunk over the 500 kB default is vendor-datagrid (@mui/x-data-grid), which is an
    // isolated, separately-cached chunk loaded only on grid routes — not the entry. Lift the warning
    // so it stops flagging that deliberate split.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Group large vendors into stable, separately-cached chunks. The route-level deps (xterm,
        // data-grid, charts) only enter the graph through their lazy chunk, so they stay on-demand;
        // react + MUI core are shared by every route and load up front.
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@xterm")) {
            return "vendor-xterm";
          }

          if (id.includes("@mui/x-data-grid")) {
            return "vendor-datagrid";
          }

          if (id.includes("@mui/x-charts")) {
            return "vendor-charts";
          }

          if (id.includes("@mui") || id.includes("@emotion")) {
            return "vendor-mui";
          }

          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("react-router") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true, secure: false },
    },
  },
  // Playwright owns e2e/**; keep Vitest (unit/integration) out of it.
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
