import { readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

import { runAll, PIPELINE_ORDER } from './transforms';

/**
 * Programmatic entry point: migrate every ethers v5 file under a directory.
 * This is what tools such as the x402 engine call on a cloned repository.
 */

export interface MigrateOptions {
  /** Report what would change without writing files (default: false). */
  dryRun?: boolean;
}

export interface MigrationTodo {
  /** Path relative to the directory that was migrated */
  file: string;
  /** 1-based line of the TODO comment */
  line: number;
  /** The comment text, without the leading `//` */
  text: string;
}

export interface MigrationResult {
  /** Supported source files found (.ts .tsx .js .jsx), excluding skipped folders */
  filesScanned: number;
  /** Files that import from ethers, ethers/lib/* or @ethersproject/* */
  ethersFiles: number;
  /** Relative paths of files the codemod changed */
  modified: string[];
  /** Files left untouched because a transform failed on them */
  failures: Array<{ file: string; error: string }>;
  /** TODO comments the codemod left for a human to resolve */
  todos: MigrationTodo[];
  /** Transforms that changed at least one file, in pipeline order */
  transformsApplied: string[];
}

const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', '.next', 'out', '.git', 'coverage', 'build', '.turbo',
]);
const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const ETHERS_IMPORT = /from\s+['"](ethers(\/lib[^'"]*)?|@ethersproject\/[^'"]+)['"]/;
const TODO_LINE = /\/\/\s*(TODO.*(?:ethers-codemod|ethers v6).*)$/;

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) results.push(...collectFiles(full));
    } else if (entry.isFile() && SUPPORTED_EXTS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

export function migrateDirectory(dir: string, options: MigrateOptions = {}): MigrationResult {
  const result: MigrationResult = {
    filesScanned: 0,
    ethersFiles: 0,
    modified: [],
    failures: [],
    todos: [],
    transformsApplied: [],
  };
  const applied = new Set<string>();

  const files = collectFiles(dir).sort();
  result.filesScanned = files.length;

  for (const file of files) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const original = readFileSync(file, 'utf8');
    if (!ETHERS_IMPORT.test(original)) continue;
    result.ethersFiles++;

    let migrated: string;
    try {
      // A file is migrated all-or-nothing: if any transform throws, it stays as it was.
      const r = runAll(file, { writeBack: false });
      migrated = r.source;
      r.appliedTransforms.forEach((t) => applied.add(t));
    } catch (err) {
      // Error messages name the file by its absolute path; keep only the
      // relative one, so callers (e.g. an HTTP API) don't leak server paths.
      const message = (err as Error).message.split(file).join(rel).split(dir).join('.');
      result.failures.push({ file: rel, error: message });
      continue;
    }

    if (migrated !== original) {
      result.modified.push(rel);
      if (!options.dryRun) writeFileSync(file, migrated, 'utf8');
    }

    migrated.split('\n').forEach((line, i) => {
      const m = TODO_LINE.exec(line);
      if (m) result.todos.push({ file: rel, line: i + 1, text: m[1].trim() });
    });
  }

  result.transformsApplied = PIPELINE_ORDER.filter((t) => applied.has(t));
  return result;
}
