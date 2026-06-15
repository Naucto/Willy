import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In the watch profile the SPA runs on Vite's dev server; /api is proxied to the
// running control plane. Default target is the compose stack behind Traefik
// (mkcert TLS, hence secure:false). Override with VITE_API_PROXY when running the
// backend directly (e.g. http://localhost:3000).
const apiProxyTarget = process.env.VITE_API_PROXY ?? "https://willy.localhost";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true, secure: false },
    },
  },
});
