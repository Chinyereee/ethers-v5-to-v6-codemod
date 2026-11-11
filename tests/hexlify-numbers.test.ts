import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import transform from '../src/transforms/hexlify-numbers';
import { runAll } from '../src/transforms';
import { applyTransform, normalize } from './testHelper';

// v5 hexlify() accepted numbers and BigNumbers; v6 hexlify() only accepts
// bytes and throws INVALID_ARGUMENT otherwise (checked against ethers 5.8.0
// and 6.17.0: v5 hexlify(0) = '0x00', v6 hexlify(0) throws, v6 toBeHex(0) = '0x00').
const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;
const TODO = 'TODO(ethers-codemod)';

describe('hexlify-numbers – numeric arguments become toBeHex', () => {
  it('number literal', () => {
    expect(applyTransform(transform, ns('const a = ethers.hexlify(0);')))
      .toBe(normalize(ns('const a = ethers.toBeHex(0);')));
  });

  it('parseUnits(...) result', () => {
    expect(applyTransform(transform, ns('const a = ethers.hexlify(ethers.parseUnits(x, 18));')))
      .toBe(normalize(ns('const a = ethers.toBeHex(ethers.parseUnits(x, 18));')));
  });

  it('BigInt(...) and bigint arithmetic', () => {
    expect(applyTransform(transform, ns('const a = ethers.hexlify(BigInt(x));\nconst b = ethers.hexlify(BigInt(x) * 2n);')))
      .toBe(normalize(ns('const a = ethers.toBeHex(BigInt(x));\nconst b = ethers.toBeHex(BigInt(x) * 2n);')));
  });

  it('named import: hexlify → toBeHex, and the unused hexlify import is dropped', () => {
    expect(applyTransform(transform, "import { hexlify } from 'ethers';\nconst a = hexlify(5);"))
      .toBe(normalize("import { toBeHex } from 'ethers';\nconst a = toBeHex(5);"));
  });
});

describe('hexlify-numbers – byte arguments are left alone', () => {
  it('a bytes-producing call stays hexlify, without a TODO', () => {
    const input = ns('const a = ethers.hexlify(ethers.randomBytes(32));\nconst b = ethers.hexlify(ethers.toUtf8Bytes(s));');
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('a string literal stays hexlify', () => {
    const input = ns("const a = ethers.hexlify('0x1234');");
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('an unknown value stays hexlify, with a TODO', () => {
    const out = applyTransform(transform, ns('const a = ethers.hexlify(value);'));
    expect(out).toContain('ethers.hexlify(value)');
    expect(out).toContain(TODO);
    expect(out).toContain('toBeHex');
  });

  it('keeps the hexlify import when some calls still use it', () => {
    const out = applyTransform(transform, "import { hexlify } from 'ethers';\nconst a = hexlify(5);\nconst b = hexlify(randomBytes(4));");
    expect(out).toContain("import { hexlify, toBeHex } from 'ethers';");
    expect(out).toContain('const a = toBeHex(5);');
    expect(out).toContain('const b = hexlify(randomBytes(4));');
  });

  it('does nothing without an ethers import', () => {
    const input = 'const a = hexlify(0);';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('hexlify-numbers – in the full pipeline (scaffold-eth Swap.jsx)', () => {
  it('ethers.utils.hexlify(number-ish) → ethers.toBeHex(...)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hexlify-'));
    const file = path.join(dir, 'Swap.jsx');
    writeFileSync(
      file,
      [
        "import { ethers } from 'ethers';",
        'const approvalAmount = ethers.utils.hexlify(0);',
        'const amountIn = ethers.utils.hexlify(ethers.utils.parseUnits(a.toString(), d));',
        'const amountOutMin = ethers.utils.hexlify(ethers.BigNumber.from(raw.toString()));',
      ].join('\n')
    );
    try {
      expect(normalize(runAll(file, { writeBack: false }).source)).toBe(
        normalize(
          [
            "import { ethers } from 'ethers';",
            'const approvalAmount = ethers.toBeHex(0);',
            'const amountIn = ethers.toBeHex(ethers.parseUnits(a.toString(), d));',
            'const amountOutMin = ethers.toBeHex(BigInt(raw.toString()));',
          ].join('\n')
        )
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
