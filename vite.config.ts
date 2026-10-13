/// <reference types="vitest" />
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Puts a build stamp in the built sw.js, so each deploy gets its own app cache and the old one is deleted. */
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = resolve(outDir, 'sw.js');
      if (!existsSync(file)) return;
      writeFileSync(file, readFileSync(file, 'utf8').replace('__BUILD__', Date.now().toString(36)));
    },
  };
}

/**
 * Writes catalogue-version.json (the catalogue's generatedAt) next to the built catalogue, so a launch can
 * check whether there is a newer catalogue without downloading the whole file. Made from the catalogue being
 * deployed, so the two can't disagree. The dev server has no such file; the app then loads the catalogue itself.
 */
function catalogueVersion(): Plugin {
  return {
    name: 'catalogue-version',
    apply: 'build',
    generateBundle() {
      const file = resolve(__dirname, 'public/catalogue.json');
      if (!existsSync(file)) return;
      const { generatedAt } = JSON.parse(readFileSync(file, 'utf8')) as { generatedAt?: string };
      if (!generatedAt) return;
      this.emitFile({ type: 'asset', fileName: 'catalogue-version.json', source: JSON.stringify({ generatedAt }) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), stampServiceWorker(), catalogueVersion()],
  test: { environment: 'node' },
});
