import { readdirSync, statSync } from 'fs';
import nodePath from 'path';
import { runAll } from './index';
import { updatePackageJson } from './updatePackageJson';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build']);
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = nodePath.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.has(nodePath.extname(name))) out.push(full);
  }
  return out;
}

const targetDir = process.argv[2];
if (!targetDir) {
  console.error('Usage: tsx cli.ts <path-to-repo>');
  process.exit(1);
}

let filesChanged = 0;
for (const file of walk(targetDir)) {
  try {
    if (runAll(file).changed) filesChanged++;
  } catch (err) {
    console.warn('SKIP', file, (err as Error).message);
  }
}

const { changed, warnings } = updatePackageJson(targetDir);
console.log(`${filesChanged} files changed. package.json updated: ${changed}`);
warnings.forEach((w) => console.warn('WARN', w));
