import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// RAW HAIRS builds from ONE codebase into TWO separate deployments:
//   storefront (index.html)  -> dist          -> rawhairs.vercel.app      (public)
//   console    (console.html) -> dist-console -> raw-hairs-console.vercel.app (staff only)
// The storefront bundle contains ZERO admin/driver code (verifiable with:
//   grep -ri "admin" dist/assets/ ). Select the target with BUILD_TARGET=console
// or `npm run build:console`.
const consoleBuild = process.env.BUILD_TARGET === 'console';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: consoleBuild ? 'dist-console' : 'dist',
    ...(consoleBuild ? { rollupOptions: { input: 'console.html' } } : {}),
  },
});
