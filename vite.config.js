import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable (any static host or sub-path).
export default defineConfig({
  base: './',
  plugins: [react()],
});
