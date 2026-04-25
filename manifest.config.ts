// Build-time manifest factory. Replaces the static manifest.json so
// the production-bundled extension can carry the deployed backend
// URL + GCP OAuth client_id WITHOUT those values living in the
// public source tree.
//
// Vite's loadEnv reads .env / .env.local / .env.production at
// vite.config.ts time and hands the result to buildManifest() below.
// Anything VITE_ prefixed also lands in `import.meta.env` for the
// runtime client side (consumed by src/shared/config.ts) — so the
// same env source feeds both the manifest fields and the runtime
// API client URL with no risk of drift.
//
// Files that supply env values, in load order (later wins):
//   .env                     committed, generic defaults if any
//   .env.local               gitignored, per-machine overrides
//   .env.{development|production}    mode-specific (vite default)
//   .env.{development|production}.local   per-machine + mode
//
// .env.example documents the expected variable names with
// placeholder values so a fresh checkout knows what to fill in.

import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

interface ManifestEnv {
  VITE_API_BASE_URL?: string;
  VITE_OAUTH_CLIENT_ID?: string;
}

// Render an API base URL into a Chrome host_permissions entry. The
// scheme + host are kept; the path is replaced by `/*` because Chrome
// requires the wildcard form, not a base URL with no glob.
function toHostPermission(apiBaseUrl: string): string {
  const u = new URL(apiBaseUrl);
  return `${u.protocol}//${u.host}/*`;
}

export function buildManifest(env: ManifestEnv) {
  // Empty fallbacks let `npm run build` still succeed in a fresh
  // checkout that hasn't created .env.production yet — but the
  // resulting bundle will obviously not be able to reach a backend.
  // src/shared/config.ts mirrors this fallback and emits a
  // console.error in prod builds to make the misconfig visible at
  // runtime instead of failing silently.
  const apiBaseUrl = env.VITE_API_BASE_URL || "http://localhost:8000";
  const oauthClientId =
    env.VITE_OAUTH_CLIENT_ID || "REPLACE_ME.apps.googleusercontent.com";

  return defineManifest({
    manifest_version: 3,
    name: "__MSG_extName__",
    // Pulled from package.json so a single bump in pkg.version
    // propagates to both the npm package metadata and the manifest.
    version: pkg.version,
    description: "__MSG_extDescription__",
    default_locale: "en",
    homepage_url: "https://github.com/Foxsunshine/DualRead",
    minimum_chrome_version: "139",
    permissions: ["storage", "sidePanel", "contextMenus", "downloads", "identity"],
    host_permissions: [
      "https://translate.googleapis.com/*",
      // Single API host derived from VITE_API_BASE_URL. Dev and prod
      // builds get distinct manifests this way — the prod-shipped
      // bundle doesn't carry a localhost permission and vice versa.
      toHostPermission(apiBaseUrl),
    ],
    oauth2: {
      client_id: oauthClientId,
      scopes: ["openid", "email", "profile"],
    },
    action: {
      default_icon: {
        "16": "icons/icon16.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png",
      },
    },
    side_panel: {
      default_path: "src/sidepanel/index.html",
    },
    background: {
      service_worker: "src/background/index.ts",
      type: "module",
    },
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content/index.ts"],
        css: ["src/content/content.css"],
        run_at: "document_idle",
        all_frames: false,
      },
    ],
    icons: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;",
    },
  });
}
