import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The deployed origin serves Content-Security-Policy: default-src 'self';
// img-src 'self' data:, so the build must emit no inline scripts. Vite's
// default output already references all JS through <script src>;
// modulePreload stays on as <link> elements, which the policy allows. The
// data: image source is for the drawing a person attaches, re-encoded in the
// browser; scripts, styles, fonts and fetches stay on 'self'.
export default defineConfig({
  plugins: [react()],
  test: {
    // Playwright owns e2e/; vitest runs the unit tests under src/ only.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
