import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The deployed origin serves Content-Security-Policy: default-src 'self',
// so the build must emit no inline scripts. Vite's default output already
// references all JS through <script src>; modulePreload stays on as <link>
// elements, which the policy allows.
export default defineConfig({
  plugins: [react()],
});
