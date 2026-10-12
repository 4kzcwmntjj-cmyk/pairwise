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

export default defineConfig({
  base: './',
  plugins: [react(), stampServiceWorker()],
  test: { environment: 'node' },
});
