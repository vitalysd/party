import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const rawColor = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\s*\(/i;
const errors = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!/\.(?:tsx?|css)$/.test(entry.name)) continue;
    let contents = await readFile(path, 'utf8');
    // The shared theme is the only place where color values should be declared.
    if (path === join(source, 'index.css')) contents = contents.replace(/@theme\s*\{[^}]*\}/g, block => block.replace(/[^\n]/g, ' '));
    for (const [index, line] of contents.split('\n').entries()) {
      if (rawColor.test(line)) errors.push(`${path}:${index + 1}: use a shared theme variable instead of a color literal`);
    }
  }
}
await scan(source);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Color audit passed: color values are centralized in src/index.css @theme.');
}
