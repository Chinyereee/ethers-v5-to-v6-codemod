import jscodeshift from 'jscodeshift';
import { readFileSync, writeFileSync } from 'fs';
import nodePath from 'path';
import type { FileInfo, API, Transform } from 'jscodeshift';

import renameUtils from './rename-utils';
import bigNumberToBigint from './bigNumber-to-bigint';
import renameProviders from './rename-providers';
import renameConstants from './rename-constants';
import renameContractMethods from './rename-contract-methods';
import renameProviderMethods from './rename-provider-methods';
import gasPriceToFeeData from './gasPrice-to-feeData';
import updateImports from './update-imports';
import awaitGetSigner from './await-getSigner';
import deepImports from './deep-imports';

// ── Named exports ─────────────────────────────────────────────────────────────

export {
  renameUtils,
  bigNumberToBigint,
  renameProviders,
  renameConstants,
  renameContractMethods,
  renameProviderMethods,
  gasPriceToFeeData,
  updateImports,
  awaitGetSigner,
  deepImports,
};

// ── Pipeline ─────────────────────────────────────────────────────────────────

/**
 * Ordered list of transforms.
 *
 * Ordering constraints:
 *  - deep-imports runs first: it moves ethers/lib/* and @ethersproject/*
 *    imports to 'ethers' so the other transforms see them
 *  - rename-utils must run before update-imports (removes `utils` usages first)
 *  - bigNumber-to-bigint must run before update-imports (removes `BigNumber` usages)
 *  - rename-providers must run before update-imports (removes `providers` usages)
 *  - rename-constants must run before update-imports (removes `constants` usages)
 *  - await-getSigner runs after rename-providers (it doesn't depend on the
 *    provider class name, but keeps the diff readable in that order)
 *  - update-imports must run last (cleans up any remaining deprecated specifiers)
 */
const PIPELINE: readonly Transform[] = [
  deepImports,
  renameUtils,
  bigNumberToBigint,
  renameProviders,
  renameConstants,
  renameContractMethods,
  renameProviderMethods,
  gasPriceToFeeData,
  awaitGetSigner,
  updateImports,
];

// ── Parser selection ──────────────────────────────────────────────────────────

type SupportedParser = 'ts' | 'tsx' | 'babel';

function inferParser(filePath: string): SupportedParser {
  const ext = nodePath.extname(filePath).toLowerCase();
  // tsx is NOT a superset of ts: it rejects angle-bracket casts (`<any>x`),
  // which are legal in .ts files. Use the parser that matches the extension.
  if (ext === '.ts') return 'ts';
  if (ext === '.tsx') return 'tsx';
  return 'babel';
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RunAllOptions {
  /** Write the result back to disk (default: true). */
  writeBack?: boolean;
  /** Override the parser instead of inferring from the file extension. */
  parser?: SupportedParser;
}

export interface RunAllResult {
  /** Final transformed source. */
  source: string;
  /** True if any transform produced a change. */
  changed: boolean;
  /** Names of transforms that modified the source, in order. */
  appliedTransforms: string[];
}

/**
 * Run all ethers v5 → v6 transforms on a single file in the correct order.
 *
 * @param filePath  Absolute or relative path to the source file.
 * @param options   Optional overrides (writeBack, parser).
 * @returns         Result object with final source and change metadata.
 */
export function runAll(
  filePath: string,
  options: RunAllOptions = {}
): RunAllResult {
  const { writeBack = true, parser: parserOverride } = options;

  const originalSource = readFileSync(filePath, 'utf-8');
  let source = originalSource;

  const parser = parserOverride ?? inferParser(filePath);
  const j = jscodeshift.withParser(parser);

  const api: API = {
    jscodeshift: j,
    j,
    stats: () => { /* no-op */ },
    report: () => { /* no-op */ },
  };

  const transformNames: readonly string[] = [
    'deep-imports',
    'rename-utils',
    'bigNumber-to-bigint',
    'rename-providers',
    'rename-constants',
    'rename-contract-methods',
    'rename-provider-methods',
    'gasPrice-to-feeData',
    'await-getSigner',
    'update-imports',
  ];

  const appliedTransforms: string[] = [];

  PIPELINE.forEach((transform, idx) => {
    const fileInfo: FileInfo = { source, path: filePath };

    let result: string | null | undefined | void;
    try {
      // All transforms in PIPELINE are synchronous.
      result = transform(fileInfo, api, {}) as string | null | undefined | void;
    } catch (err) {
      const name = transformNames[idx];
      throw new Error(
        `Transform "${name}" failed on ${filePath}: ${(err as Error).message}`,
        { cause: err }
      );
    }

    // A transform returns null/undefined/void to signal "no change".
    if (result != null && result !== source) {
      appliedTransforms.push(transformNames[idx]);
      source = result;
    }
  });

  if (writeBack && source !== originalSource) {
    writeFileSync(filePath, source, 'utf-8');
  }

  return {
    source,
    changed: source !== originalSource,
    appliedTransforms,
  };
}
