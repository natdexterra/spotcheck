// Fails the build check if any built HTML contains an inline <script>.
// The deployed CSP is default-src 'self'; an inline script would be blocked.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...htmlFiles(path));
    } else if (entry.endsWith('.html')) {
      found.push(path);
    }
  }
  return found;
}

const files = htmlFiles('dist');
if (files.length === 0) {
  console.error('check-no-inline-scripts: no HTML files in dist/ — run pnpm build first');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    if (!/\bsrc\s*=/i.test(match[0])) {
      console.error(`${file}: inline <script> found: ${match[0]}`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(`check-no-inline-scripts: ${files.length} HTML file(s) clean`);
