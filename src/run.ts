#!/usr/bin/env ts-node
/**
 * CLI runner: applies all ethers v5 → v6 transforms to a target directory.
 *
 * Usage:
 *   npx ts-node src/run.ts ./path/to/project
 *   npx ts-node src/run.ts                    # defaults to cwd
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';
import jscodeshift from 'jscodeshift';
import type { FileInfo, Transform } from 'jscodeshift';

import renameUtils from './transforms/rename-utils';
import bigNumberToBigint from './transforms/bigNumber-to-bigint';
import renameProviders from './transforms/rename-providers';
import gasPriceToFeeData from './transforms/gasPrice-to-feeData';
import updateImports from './transforms/update-imports';

// ── Transform pipeline ───────────────────────────────────────────────────────

const PIPELINE: Array<{ name: string; fn: Transform }> = [
  { name: 'rename-utils',          fn: renameUtils },
  { name: 'bigNumber-to-bigint',   fn: bigNumberToBigint },
  { name: 'rename-providers',      fn: renameProviders },
  { name: 'gasPrice-to-feeData',   fn: gasPriceToFeeData },
  { name: 'update-imports',        fn: updateImports },
];

// ── Config ───────────────────────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', '.next', 'out', '.git', 'coverage', 'build', '.turbo',
]);
const SUPPORTED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const ansi = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  red:     '\x1b[31m',
  blue:    '\x1b[34m',
};

const fmt = {
  bold:   (s: string) => `${ansi.bold}${s}${ansi.reset}`,
  dim:    (s: string) => `${ansi.dim}${s}${ansi.reset}`,
  green:  (s: string) => `${ansi.green}${s}${ansi.reset}`,
  yellow: (s: string) => `${ansi.yellow}${s}${ansi.reset}`,
  cyan:   (s: string) => `${ansi.cyan}${s}${ansi.reset}`,
  red:    (s: string) => `${ansi.red}${s}${ansi.reset}`,
  blue:   (s: string) => `${ansi.blue}${s}${ansi.reset}`,
};

// ── File utilities ────────────────────────────────────────────────────────────

/** Recursively collect supported source files, honouring EXCLUDED_DIRS. */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // unreadable directory — skip silently
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

/** Quick pre-filter: does the file contain an ethers import at all? */
function hasEthersImport(source: string): boolean {
  return /from\s+['"]ethers['"]/.test(source);
}

/**
 * Count how many codemod TODO lines are present.
 * Both bigNumber-to-bigint and gasPrice-to-feeData use these distinct patterns.
 */
function countTodos(source: string): number {
  return (source.match(/\/\/\s*TODO.*(?:ethers-codemod|ethers v6)/g) ?? []).length;
}

// ── Transform application ────────────────────────────────────────────────────

function applyTransform(fn: Transform, source: string, filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const parser = ['.ts', '.tsx'].includes(ext) ? 'tsx' : 'babel';
  const j = jscodeshift.withParser(parser);
  const fileInfo: FileInfo = { source, path: filePath };
  const api = {
    jscodeshift: j,
    j,
    stats:  (_name: string) => { /* unused */ },
    report: (_msg:  string) => { /* unused */ },
  };
  // Use `as never` to bridge the strict API type — our mock satisfies the
  // runtime contract even though @types/jscodeshift evolved its interface.
  const result = (fn as (f: FileInfo, a: never, o: object) => unknown)(
    fileInfo, api as never, {}
  );
  return typeof result === 'string' ? result : source;
}

// ── Reporting helpers ────────────────────────────────────────────────────────

function rule(label: string): void {
  const width = 52;
  const pad = Math.max(0, width - label.length - 4);
  console.log(fmt.bold(`─── ${label} ${'─'.repeat(pad)}`));
}

function printAiReviewGuide(todoFiles: string[], rootDir: string): void {
  rule('Remaining patterns for AI review');
  if (todoFiles.length > 0) {
    console.log(fmt.yellow(`\n  ${todoFiles.length} file(s) contain TODO comments that need human + AI attention:\n`));
    for (const f of todoFiles) {
      console.log(`  ${fmt.yellow('!')} ${path.relative(rootDir, f)}`);
    }
  }

  console.log(`
${fmt.cyan(fmt.bold('1. Untracked BigNumber method calls'))}
${fmt.dim('   Marker: // TODO(ethers-codemod): verify this BigNumber method call')}

   These appear when .toNumber() or .toHexString() is called on a value whose
   BigNumber origin the codemod couldn't statically trace (e.g. a return value
   from a contract call, or a parameter).

   ${fmt.bold('Prompt:')} "Find every line marked TODO(ethers-codemod) in this file. For each
   .toNumber() call, replace it with Number(value) after confirming the receiver
   is a BigNumber/bigint. For .toHexString(), replace with value.toString(16)."


${fmt.cyan(fmt.bold('2. Non-awaited getGasPrice() calls'))}
${fmt.dim('   Marker: // TODO: ethers v6 - replace getGasPrice()')}

   The codemod only auto-migrates awaited calls. Non-awaited calls may be used
   in Promise chains, stored as Promises, or passed as callbacks.

   ${fmt.bold('Prompt:')} "Replace provider.getGasPrice() with provider.getFeeData(), then
   decide which field to use:
   • .gasPrice           — for legacy (non-EIP-1559) transactions
   • .maxFeePerGas       — for EIP-1559 max fee cap
   • .maxPriorityFeePerGas — for the priority (tip) fee
   Adjust the surrounding Promise chain / .then() handling accordingly."


${fmt.cyan(fmt.bold('3. Cross-scope BigNumber arithmetic'))}
${fmt.dim('   e.g. BigNumber values from contract returns, function parameters')}

   The codemod only rewrites arithmetic (.add / .sub / .mul / .div / comparison)
   on variables it can trace back to a local BigNumber.from() call.

   ${fmt.bold('Prompt:')} "Find all .add(), .sub(), .mul(), .div(), .gt(), .lt(), .eq() calls
   whose receiver comes from a contract call or external source. Convert the
   receiver to BigInt() and replace each method with its operator (+, -, *, /, >,
   <, ===)."


${fmt.cyan(fmt.bold('4. Signer type annotation changes'))}
${fmt.dim('   ethers.Signer is now abstract; most concrete signers are JsonRpcSigner')}

   ${fmt.bold('Prompt:')} "Replace ethers.Signer type annotations with ethers.JsonRpcSigner
   where the value comes from provider.getSigner(). Keep Signer as the abstract
   interface type for parameters that accept any signer implementation."


${fmt.cyan(fmt.bold('5. Contract event filter API'))}
${fmt.dim('   contract.filters.EventName() and event listener signatures changed')}

   ${fmt.bold('Prompt:')} "Review all contract.filters.X() usages. In ethers v6, filters are
   constructed with undefined instead of null for wildcard arguments. Also check
   contract.on() / contract.once() callbacks — the event object is now the last
   argument, not first."
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);

  if (argv[0] === '--help' || argv[0] === '-h') {
    console.log('Usage: npx ts-node src/run.ts [directory]');
    console.log('       directory defaults to the current working directory');
    process.exit(0);
  }

  const targetDir = path.resolve(argv[0] ?? '.');

  console.log();
  console.log(fmt.bold('  ethers v5 → v6 codemod'));
  console.log(fmt.dim(`  Target: ${targetDir}`));
  console.log();

  // ── 1. Collect candidate files ──────────────────────────────────────────
  const allFiles = collectFiles(targetDir);
  const candidates: Array<{ filePath: string; source: string }> = [];

  for (const filePath of allFiles) {
    try {
      const source = readFileSync(filePath, 'utf-8');
      if (hasEthersImport(source)) candidates.push({ filePath, source });
    } catch { /* unreadable — skip */ }
  }

  console.log(fmt.dim(`  Scanned ${allFiles.length} file(s) — ${candidates.length} import from 'ethers'\n`));

  if (candidates.length === 0) {
    console.log(fmt.yellow("  No files import from 'ethers'. Nothing to migrate."));
    console.log();
    return;
  }

  // ── 2. Run transforms ───────────────────────────────────────────────────
  const transformCounts: Record<string, number> = Object.fromEntries(
    PIPELINE.map(({ name }) => [name, 0])
  );
  const modifiedFiles:  string[] = [];
  const todoFiles:      string[] = [];
  const errorFiles:     string[] = [];

  for (const { filePath, source: originalSource } of candidates) {
    const rel = path.relative(targetDir, filePath);
    const todosBefore = countTodos(originalSource);
    let current = originalSource;

    for (const { name, fn } of PIPELINE) {
      const before = current;
      try {
        current = applyTransform(fn, current, filePath);
        if (current !== before) transformCounts[name]++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ${fmt.red('✗')} ${fmt.bold(name)} failed on ${rel}: ${fmt.dim(msg)}`);
        current = before; // restore to pre-failed-transform state
        errorFiles.push(filePath);
      }
    }

    const changed = current !== originalSource;
    const todosAdded = countTodos(current) > todosBefore;

    if (changed) {
      try {
        writeFileSync(filePath, current, 'utf-8');
        modifiedFiles.push(filePath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ${fmt.red('✗')} write failed on ${rel}: ${fmt.dim(msg)}`);
        errorFiles.push(filePath);
      }
    }

    if (todosAdded) todoFiles.push(filePath);
  }

  // ── 3. Summary ──────────────────────────────────────────────────────────
  console.log();
  rule('Summary');
  console.log(`  Files scanned     ${fmt.bold(String(allFiles.length))}`);
  console.log(`  Ethers files      ${fmt.bold(String(candidates.length))}`);
  console.log(`  Modified          ${fmt.green(fmt.bold(String(modifiedFiles.length)))}`);
  console.log(`  Needs AI review   ${todoFiles.length > 0 ? fmt.yellow(fmt.bold(String(todoFiles.length))) : fmt.dim('0')}`);
  if (errorFiles.length > 0) {
    console.log(`  Errors            ${fmt.red(fmt.bold(String(errorFiles.length)))}`);
  }

  console.log();
  rule('Transform breakdown');
  for (const { name } of PIPELINE) {
    const n = transformCounts[name];
    const icon = n > 0 ? fmt.green('✓') : fmt.dim('·');
    const count = n > 0 ? fmt.bold(String(n)) : fmt.dim('0');
    console.log(`  ${icon}  ${name.padEnd(26)} ${count} file(s) changed`);
  }

  if (modifiedFiles.length > 0) {
    console.log();
    rule('Modified files');
    for (const f of modifiedFiles) {
      console.log(`  ${fmt.green('✓')}  ${path.relative(targetDir, f)}`);
    }
  }

  if (errorFiles.length > 0) {
    console.log();
    rule('Errors');
    for (const f of [...new Set(errorFiles)]) {
      console.log(`  ${fmt.red('✗')}  ${path.relative(targetDir, f)}`);
    }
  }

  console.log();
  printAiReviewGuide(todoFiles, targetDir);
}

main();
