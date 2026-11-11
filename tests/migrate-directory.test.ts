import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { migrateDirectory } from '../src';

// The programmatic API the x402 engine calls on a cloned repository.
function makeRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'migrate-dir-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe('migrateDirectory', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('migrates ethers files, skips the rest, and reports what changed', () => {
    dir = makeRepo({
      'src/a.ts': "import * as ethers from 'ethers';\nexport const v = ethers.utils.parseEther('1');",
      'src/b.ts': 'export const plain = 1;',
      'node_modules/x/index.ts': "import * as ethers from 'ethers';\nethers.utils.parseEther('1');",
    });
    const result = migrateDirectory(dir);

    expect(result.filesScanned).toBe(2); // node_modules is skipped
    expect(result.ethersFiles).toBe(1);
    expect(result.modified).toEqual(['src/a.ts']);
    expect(result.failures).toEqual([]);
    expect(readFileSync(path.join(dir, 'src/a.ts'), 'utf8')).toContain("ethers.parseEther('1')");
  });

  it('includes files that only import from ethers/lib/* or @ethersproject/*', () => {
    dir = makeRepo({ 'p.ts': "import { splitSignature } from 'ethers/lib/utils';\nexport const s = splitSignature(x);" });
    expect(migrateDirectory(dir).modified).toEqual(['p.ts']);
  });

  it('lists every TODO the codemod left, with file and line', () => {
    dir = makeRepo({
      'c.tsx': "import * as ethers from 'ethers';\nexport default function App() {\n  const s = provider.getSigner();\n  return null;\n}",
    });
    const { todos } = migrateDirectory(dir);
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ file: 'c.tsx', line: 3 });
    expect(todos[0].text).toContain('getSigner()');
  });

  it('dryRun reports changes without writing them', () => {
    dir = makeRepo({ 'a.ts': "import * as ethers from 'ethers';\nexport const v = ethers.utils.parseEther('1');" });
    const before = readFileSync(path.join(dir, 'a.ts'), 'utf8');
    const result = migrateDirectory(dir, { dryRun: true });
    expect(result.modified).toEqual(['a.ts']);
    expect(readFileSync(path.join(dir, 'a.ts'), 'utf8')).toBe(before);
  });

  it('leaves a file untouched and reports it when a transform fails', () => {
    dir = makeRepo({ 'bad.ts': "import * as ethers from 'ethers';\nconst = ;" });
    const before = readFileSync(path.join(dir, 'bad.ts'), 'utf8');
    const result = migrateDirectory(dir);
    expect(result.modified).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].file).toBe('bad.ts');
    expect(readFileSync(path.join(dir, 'bad.ts'), 'utf8')).toBe(before);
  });

  it('reports which transforms ran, in pipeline order', () => {
    dir = makeRepo({
      'a.ts': "import * as ethers from 'ethers';\nexport const v = ethers.utils.parseEther('1');",
      'b.ts': "import { BigNumber } from 'ethers';\nexport const b = BigNumber.from(1);",
    });
    expect(migrateDirectory(dir).transformsApplied).toEqual(['rename-utils', 'bigNumber-to-bigint']);
  });

  it('never puts the absolute path of the directory in a failure message', () => {
    dir = makeRepo({ 'bad.ts': "import * as ethers from 'ethers';\nconst = ;" });
    const { failures } = migrateDirectory(dir);
    expect(failures[0].error).not.toContain(dir);
    expect(failures[0].error).toContain('bad.ts');
  });

  it('does not follow symlinks (an untrusted repo could point them anywhere)', () => {
    const outside = makeRepo({ 'secret.ts': "import * as ethers from 'ethers';\nethers.utils.parseEther('1');" });
    dir = makeRepo({ 'real.ts': 'export const x = 1;' });
    symlinkSync(path.join(outside, 'secret.ts'), path.join(dir, 'link.ts'));
    symlinkSync(outside, path.join(dir, 'linkdir'));
    try {
      const result = migrateDirectory(dir);
      expect(result.filesScanned).toBe(1);
      expect(result.modified).toEqual([]);
      expect(readFileSync(path.join(outside, 'secret.ts'), 'utf8')).toContain('ethers.utils.parseEther');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
