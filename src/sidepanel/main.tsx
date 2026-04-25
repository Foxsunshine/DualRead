import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// v2.2 / D3 + P0-7: self-host Noto Sans JP via @fontsource-variable so we
// avoid adding fonts.googleapis.com / fonts.gstatic.com to the manifest's
// host_permissions surface (which would trigger a CWS full re-review).
//
// `@fontsource-variable/noto-sans-jp/wght.css` declares one @font-face per
// unicode-range subset, all referencing a single woff2-variations file
// per subset. Browsers smart-fetch only the subsets containing rendered
// glyphs (kana, JIS kanji), and a single variable file covers every
// font-weight from 100–900 — no per-weight payload duplication. The
// extension zip carries every subset file but only ~10 % is ever fetched
// at runtime. Trade-off accepted for v2.2; future polish: prune unused
// subsets via a custom @font-face declaration that references only the
// japanese ranges.
import "@fontsource-variable/noto-sans-jp/wght.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
