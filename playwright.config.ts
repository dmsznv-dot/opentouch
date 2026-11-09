import { defineConfig } from '@playwright/test';

const RENDER_PORT = 5199;

export default defineConfig({
  reporter: [['list']],
  projects: [
    {
      name: 'render',
      testDir: 'tests/render',
      use: {
        baseURL: `http://localhost:${RENDER_PORT}`,
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    { name: 'e2e', testDir: 'tests/e2e', timeout: 60_000 },
  ],
  webServer: {
    command: `npx vite --config tests/render/vite.config.ts --port ${RENDER_PORT} --strictPort`,
    url: `http://localhost:${RENDER_PORT}/tests/render/harness.html`,
    reuseExistingServer: true,
  },
});
