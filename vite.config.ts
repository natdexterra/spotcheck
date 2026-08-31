import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The deployed origin serves Content-Security-Policy: default-src 'self',
// so the build must emit no inline scripts. Vite's default output already
// references all JS through <script src>; modulePreload stays on as <link>
// elements, which the policy allows.
export default defineConfig({
  plugins: [react()],
  test: {
    // Playwright owns e2e/; vitest runs the unit tests under src/ only.
    include: ['src/**/*.test.ts'],
  },
});
