// Separate from vite.config.ts on purpose: vite.config.ts registers
// `@crxjs/vite-plugin`, which reads manifest.json and assumes a browser-
// extension build. Vitest would run that plugin at test startup and either
// slow tests down or fail outright. Keeping the test config minimal (no
// plugins, node env) also means unit tests stay as lightweight as the
// functions they cover.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
