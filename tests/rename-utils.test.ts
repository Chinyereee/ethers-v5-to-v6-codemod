import transform from '../src/transforms/rename-utils';
import { applyTransform, normalize, readFixture } from './testHelper';

// Wrap body in a namespace import so hasEthersNamespace = true
const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;
// Wrap body in a destructured utils import
const ds = (body: string) => `import { utils } from 'ethers';\n${body}`;

describe('rename-utils – namespace (ethers.utils.X)', () => {
  it('parseEther', () => {
    expect(applyTransform(transform, ns("const x = ethers.utils.parseEther('1.0');")))
      .toBe(normalize(ns("const x = ethers.parseEther('1.0');")));
  });

  it('formatEther', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.formatEther(bn);')))
      .toBe(normalize(ns('const x = ethers.formatEther(bn);')));
  });

  it('parseUnits', () => {
    expect(applyTransform(transform, ns("const x = ethers.utils.parseUnits('1.0', 18);")))
      .toBe(normalize(ns("const x = ethers.parseUnits('1.0', 18);")));
  });

  it('formatUnits', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.formatUnits(bn, 18);')))
      .toBe(normalize(ns('const x = ethers.formatUnits(bn, 18);')));
  });

  it('keccak256', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.keccak256(data);')))
      .toBe(normalize(ns('const x = ethers.keccak256(data);')));
  });

  it('sha256', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.sha256(data);')))
      .toBe(normalize(ns('const x = ethers.sha256(data);')));
  });

  it('toUtf8Bytes', () => {
    expect(applyTransform(transform, ns("const x = ethers.utils.toUtf8Bytes('hello');")))
      .toBe(normalize(ns("const x = ethers.toUtf8Bytes('hello');")));
  });

  it('toUtf8String', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.toUtf8String(bytes);')))
      .toBe(normalize(ns('const x = ethers.toUtf8String(bytes);')));
  });

  it('hexlify', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.hexlify(bytes);')))
      .toBe(normalize(ns('const x = ethers.hexlify(bytes);')));
  });

  it('arrayify → getBytes (renamed)', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.arrayify(hex);')))
      .toBe(normalize(ns('const x = ethers.getBytes(hex);')));
  });

  it('hexZeroPad → zeroPadValue (renamed)', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.hexZeroPad(hex, 32);')))
      .toBe(normalize(ns('const x = ethers.zeroPadValue(hex, 32);')));
  });

  it('zeroPad → zeroPadBytes (renamed)', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.zeroPad(arr, 32);')))
      .toBe(normalize(ns('const x = ethers.zeroPadBytes(arr, 32);')));
  });

  it('isAddress', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.isAddress(addr);')))
      .toBe(normalize(ns('const x = ethers.isAddress(addr);')));
  });

  it('getAddress', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.getAddress(addr);')))
      .toBe(normalize(ns('const x = ethers.getAddress(addr);')));
  });

  it('id', () => {
    expect(applyTransform(transform, ns("const x = ethers.utils.id('Transfer(address,address,uint256)');")))
      .toBe(normalize(ns("const x = ethers.id('Transfer(address,address,uint256)');")));
  });

  it('splitSignature → Signature.from (renamed)', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.splitSignature(sigData);')))
      .toBe(normalize(ns('const x = ethers.Signature.from(sigData);')));
  });

  it('defaultAbiCoder → AbiCoder.defaultAbiCoder() (property → call)', () => {
    expect(applyTransform(transform, ns('const x = ethers.utils.defaultAbiCoder;')))
      .toBe(normalize(ns('const x = ethers.AbiCoder.defaultAbiCoder();')));
  });

  it('does not transform non-ethers utils calls', () => {
    const input = ns('const x = foo.utils.parseEther(v);');
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('rename-utils – destructured (import { utils })', () => {
  it('replaces utils.parseEther, removes utils, adds ethers to import', () => {
    expect(
      applyTransform(transform, ds("const x = utils.parseEther('1.0');"))
    ).toBe(normalize("import { ethers } from 'ethers';\nconst x = ethers.parseEther('1.0');"));
  });

  it('replaces utils.arrayify → ethers.getBytes', () => {
    expect(applyTransform(transform, ds('const x = utils.arrayify(hex);')))
      .toBe(normalize("import { ethers } from 'ethers';\nconst x = ethers.getBytes(hex);"));
  });

  it('replaces utils.splitSignature → ethers.Signature.from', () => {
    expect(applyTransform(transform, ds('const x = utils.splitSignature(sig);')))
      .toBe(normalize("import { ethers } from 'ethers';\nconst x = ethers.Signature.from(sig);"));
  });

  it('replaces utils.defaultAbiCoder → ethers.AbiCoder.defaultAbiCoder()', () => {
    expect(applyTransform(transform, ds('const x = utils.defaultAbiCoder;')))
      .toBe(normalize("import { ethers } from 'ethers';\nconst x = ethers.AbiCoder.defaultAbiCoder();"));
  });

  it('preserves other named imports alongside utils', () => {
    const input = "import { utils, Contract } from 'ethers';\nconst x = utils.parseEther('1.0');\nconst c = new Contract(a, b, s);";
    const expected = "import { ethers, Contract } from 'ethers';\nconst x = ethers.parseEther('1.0');\nconst c = new Contract(a, b, s);";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('does not add ethers if ethers already imported', () => {
    const input = "import { utils, ethers } from 'ethers';\nconst x = utils.keccak256(d);";
    const expected = "import { ethers } from 'ethers';\nconst x = ethers.keccak256(d);";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('rename-utils – fixture: all 17 namespace patterns', () => {
  it('transforms all 17 ethers.utils.X patterns in one pass', () => {
    const input = readFixture('rename-utils', 'input.ts');
    const expected = readFixture('rename-utils', 'output.ts');
    expect(applyTransform(transform, input)).toBe(expected);
  });

  it('transforms destructured utils patterns in one pass', () => {
    const input = readFixture('rename-utils', 'destructured-input.ts');
    const expected = readFixture('rename-utils', 'destructured-output.ts');
    expect(applyTransform(transform, input)).toBe(expected);
  });
});
