import jscodeshift from 'jscodeshift';
import { readFileSync } from 'fs';
import path from 'path';
import type { FileInfo, Transform } from 'jscodeshift';

/** Apply a transform with the TSX parser and return normalised output. */
export function applyTransform(
  transform: Transform,
  source: string,
  filePath = 'test.ts'
): string {
  const j = jscodeshift.withParser('tsx');
  const fileInfo: FileInfo = { source, path: filePath };
  // Build the API object manually — the @types/jscodeshift API interface
  // also requires the `j` shorthand alias.
  const api = {
    jscodeshift: j,
    j,
    stats: (_name: string) => { /* no-op */ },
    report: (_msg: string) => { /* no-op */ },
  };
  const raw = transform(fileInfo, api as never, {});
  const result = typeof raw === 'string' ? raw : source;
  return normalize(result);
}

/** Read a fixture file relative to the tests/fixtures directory. */
export function readFixture(transformName: string, fileName: string): string {
  return normalize(
    readFileSync(
      path.join(__dirname, 'fixtures', transformName, fileName),
      'utf-8'
    )
  );
}

/**
 * Normalise source for comparison:
 *  - Trim leading/trailing whitespace
 *  - Normalise CRLF → LF
 *  - Collapse 3+ consecutive blank lines to 2 (handles removed-import artefacts)
 */
export function normalize(s: string): string {
  return s
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}
