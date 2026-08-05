/**
 * Vite config for the UI plane (WP11+).
 *
 * - `base: "./"` — the deploy target is GitHub Pages under a project base path
 *   (plan §8 WP14); relative URLs survive any base without a rebuild.
 * - `worker.format: "es"` — the sim worker is an ES module
 *   (`@websim/engine/worker/simWorker`, instantiated via the `?worker` form in
 *   `src/sim/client.ts`).
 * - `publicDir: "public"` — filled by `scripts/stage-assets.ts` from
 *   `pipeline/out/assets` + `pipeline/out/archive-bundles`. The staged copy is
 *   git-ignored; the pipeline output stays the single source of truth and the
 *   manifest SHA-256s are verified at load (`src/assets/loader.ts`), so a stale
 *   staging copy fails loudly rather than silently serving old bytes.
 */
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig({
  // WP11 integration fix: the workspace carries two vite installs — the root
  // hoists vite 7.x (vitest tooling) and this package nests its own ^6.4.x
  // (the build Vite). `@vitejs/plugin-react` is hoisted, so its declarations
  // type `react()` against the ROOT vite's `Plugin`, which is structurally
  // incompatible with the local one under `exactOptionalPropertyTypes`. At
  // runtime the local Vite consumes the hook object fine (the plugin's peer
  // range includes ^6); the cast is confined to exactly this seam.
  plugins: [react() as unknown as PluginOption],
  base: "./",
  publicDir: "public",
  worker: { format: "es" },
  build: {
    target: "es2022",
    sourcemap: true,
    // deck.gl + maplibre are legitimately large; the warning is noise here.
    chunkSizeWarningLimit: 2000,
  },
});
