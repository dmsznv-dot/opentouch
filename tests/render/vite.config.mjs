import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the repo root so render tests can load src/** and tests/fixtures/** directly.
export default defineConfig({ root: '.', plugins: [react()], server: { fs: { strict: false } }, logLevel: 'warn' });
