// Compile-time configuration constants.
//
// API_BASE_URL points at the FastAPI backend. Phase 1 W4 only has a
// local dev target — uvicorn at :8000 spun up via the backend repo's
// `docker compose up -d && uv run uvicorn app.main:app --reload`
// runbook. Phase 1 W5 swaps the prod branch to the Railway URL once
// the backend ships there.
//
// Host_permissions in manifest.json must mirror this — the MV3
// service worker can only fetch hosts declared there (and that's
// also what bypasses CORS for the extension origin).
export const API_BASE_URL = import.meta.env.DEV
  ? "http://localhost:8000"
  : "http://localhost:8000"; // TODO Phase 1 W5: replace with Railway URL
