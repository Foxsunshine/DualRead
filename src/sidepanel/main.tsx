import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// v2.2 / D3 + P0-7: self-host Noto Sans JP via @fontsource so we avoid
// adding fonts.googleapis.com / fonts.gstatic.com to the manifest's
// host_permissions surface (which would trigger a CWS full re-review).
//
// Importing the `japanese-*` subset CSS files specifically — NOT the
// umbrella `400.css` etc. The umbrella imports include every unicode-range
// subset @fontsource ships (latin, cyrillic, vietnamese, …), pulling in
// ~120 unused woff2 files. The `japanese-*` files cover only what we
// actually need: hiragana, katakana, halfwidth, JIS kanji L1+L2.
// One weight (400) is enough for v2.2 — bold JA UI text is rare and
// browsers synthesize bold acceptably; adding 500/700 would triple the
// bundled font footprint for marginal gain.
import "@fontsource/noto-sans-jp/japanese-400.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root missing");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
