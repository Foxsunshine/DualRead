// Compile-time configuration constants.
//
// API_BASE_URL is injected at build time from `VITE_API_BASE_URL` in
// .env.{mode}. Vite replaces `import.meta.env.VITE_API_BASE_URL` with
// the literal string in the bundle, so there's no runtime lookup
// cost. The same value also drives manifest.config.ts's
// host_permissions entry — single source of truth for the backend URL.
//
// .env.production is gitignored on purpose: the prod URL (currently
// a Railway-generated subdomain) doesn't belong in the public source
// tree. .env.example carries documented placeholders for fresh
// checkouts; see DualRead-backend/docs/runbooks/deploy.md for how
// to obtain the prod URL after deploying.
//
// Fallback to localhost lets `npm run build` still succeed in a
// brand-new checkout without a configured .env, which is useful for
// CI smoke tests; the loud console.error in prod builds makes the
// misconfig visible at runtime instead of failing silently with
// "fetch http://localhost:8000" on a real user's machine.
const fromEnv = import.meta.env.VITE_API_BASE_URL;

if (!fromEnv && import.meta.env.PROD) {
  console.error(
    "[DualRead] VITE_API_BASE_URL not set at build time; backend calls will target localhost and fail in production. Create .env.production from .env.example.",
  );
}

export const API_BASE_URL = fromEnv ?? "http://localhost:8000";
