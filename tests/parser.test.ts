import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { runAll } from '../src/transforms';
import { normalize } from './testHelper';

// .ts files were parsed with the tsx parser, which rejects angle-bracket casts
// (`<any>x`). Every transform then failed on the file and it was silently
// skipped (Aave v3 core: test-suites/helpers/actions.ts, utils/calculations.ts).
function migrate(fileName: string, source: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'parser-'));
  const file = path.join(dir, fileName);
  writeFileSync(file, source);
  try {
    return normalize(runAll(file, { writeBack: false }).source);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('parser selection', () => {
  it('migrates a .ts file that uses an angle-bracket cast', () => {
    const out = migrate(
      'a.ts',
      "import * as ethers from 'ethers';\nconst x = <any>value;\nconst v = ethers.utils.parseEther('1');"
    );
    expect(out).toBe(
      normalize("import * as ethers from 'ethers';\nconst x = <any>value;\nconst v = ethers.parseEther('1');")
    );
  });

  it('still migrates a .tsx file with JSX', () => {
    const out = migrate(
      'b.tsx',
      "import * as ethers from 'ethers';\nexport const C = () => <span>{ethers.utils.formatEther(v)}</span>;"
    );
    expect(out).toContain('{ethers.formatEther(v)}');
  });

  it('still migrates a .jsx file', () => {
    const out = migrate(
      'c.jsx',
      "import { ethers } from 'ethers';\nexport const C = () => <span>{ethers.utils.formatEther(v)}</span>;"
    );
    expect(out).toContain('{ethers.formatEther(v)}');
  });
});
