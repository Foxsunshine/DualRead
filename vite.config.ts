import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { buildManifest } from "./manifest.config";

// Vite's `defineConfig` callback gives us `mode` so we can route
// loadEnv at the right .env.{mode} file. mode defaults to
// "development" for `vite dev` and "production" for `vite build`.
// Anything VITE_*-prefixed in those files lands in import.meta.env
// for client code AND is forwarded to buildManifest() below for the
// MV3 manifest's oauth2.client_id + host_permissions.
export default defineConfig(({ mode }) => {
  // Third arg `""` means "load all VITE_-prefixed vars" — Vite's
  // loadEnv defaults to filtering to a specific prefix, but we want
  // to centralize the prefix handling in manifest.config.ts.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), crx({ manifest: buildManifest(env) })],
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
  };
});
