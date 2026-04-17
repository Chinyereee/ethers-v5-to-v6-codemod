import transform from '../src/transforms/bigNumber-to-bigint';
import { applyTransform, normalize, readFixture } from './testHelper';

// Helper: wrap body in a named BigNumber import
const named = (body: string) => `import { BigNumber } from 'ethers';\n${body}`;
// Helper: wrap body in a namespace ethers import
const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;

describe('bigNumber-to-bigint – ethers.BigNumber.from (namespace)', () => {
  it('converts ethers.BigNumber.from(string) → BigInt(string)', () => {
    expect(applyTransform(transform, ns("const x = ethers.BigNumber.from('100');")))
      .toBe(normalize(ns("const x = BigInt('100');")));
  });

  it('converts ethers.BigNumber.from(number) → BigInt(number)', () => {
    expect(applyTransform(transform, ns('const x = ethers.BigNumber.from(42);')))
      .toBe(normalize(ns('const x = BigInt(42);')));
  });

  it('converts ethers.BigNumber.from(variable) → BigInt(variable)', () => {
    expect(applyTransform(transform, ns('const x = ethers.BigNumber.from(value);')))
      .toBe(normalize(ns('const x = BigInt(value);')));
  });
});

describe('bigNumber-to-bigint – BigNumber.from (named import)', () => {
  it('converts BigNumber.from(string) → BigInt(string) and removes import', () => {
    expect(applyTransform(transform, named("const x = BigNumber.from('100');")))
      .toBe(normalize("const x = BigInt('100');"));
  });

  it('converts chained .toNumber() on direct BigNumber.from call', () => {
    expect(applyTransform(transform, named('const n = BigNumber.from(value).toNumber();')))
      .toBe(normalize('const n = Number(BigInt(value));'));
  });

  it('converts chained .toHexString() on direct BigNumber.from call', () => {
    expect(applyTransform(transform, named("const h = BigNumber.from('255').toHexString();")))
      .toBe(normalize("const h = BigInt('255').toString(16);"));
  });

  it('converts .toNumber() on tracked variable', () => {
    const input = named("const bn = BigNumber.from('5');\nconst n = bn.toNumber();");
    const expected = "const bn = BigInt('5');\nconst n = Number(bn);";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('converts .toHexString() on tracked variable', () => {
    const input = named("const bn = BigNumber.from('255');\nconst h = bn.toHexString();");
    const expected = "const bn = BigInt('255');\nconst h = bn.toString(16);";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('bigNumber-to-bigint – arithmetic operators on tracked variables', () => {
  const setup = (expr: string) =>
    named(`const a = BigNumber.from('10');\nconst b = BigNumber.from('20');\nconst r = ${expr};`);
  const expected = (expr: string) =>
    normalize(`const a = BigInt('10');\nconst b = BigInt('20');\nconst r = ${expr};`);

  it('.add(b) → a + b', () => {
    expect(applyTransform(transform, setup('a.add(b)'))).toBe(expected('a + b'));
  });

  it('.sub(b) → a - b', () => {
    expect(applyTransform(transform, setup('a.sub(b)'))).toBe(expected('a - b'));
  });

  it('.mul(b) → a * b', () => {
    expect(applyTransform(transform, setup('a.mul(b)'))).toBe(expected('a * b'));
  });

  it('.div(b) → a / b', () => {
    expect(applyTransform(transform, setup('a.div(b)'))).toBe(expected('a / b'));
  });

  it('.eq(b) → a === b', () => {
    expect(applyTransform(transform, setup('a.eq(b)'))).toBe(expected('a === b'));
  });

  it('.gt(b) → a > b', () => {
    expect(applyTransform(transform, setup('a.gt(b)'))).toBe(expected('a > b'));
  });

  it('.gte(b) → a >= b', () => {
    expect(applyTransform(transform, setup('a.gte(b)'))).toBe(expected('a >= b'));
  });

  it('.lt(b) → a < b', () => {
    expect(applyTransform(transform, setup('a.lt(b)'))).toBe(expected('a < b'));
  });

  it('.lte(b) → a <= b', () => {
    expect(applyTransform(transform, setup('a.lte(b)'))).toBe(expected('a <= b'));
  });

  it('.add() on direct BigNumber.from call', () => {
    const input = named("const r = BigNumber.from('10').add(BigNumber.from('20'));");
    expect(applyTransform(transform, input))
      .toBe(normalize("const r = BigInt('10') + BigInt('20');"));
  });
});

describe('bigNumber-to-bigint – TODO comments for untracked receivers', () => {
  it('adds TODO comment above .toNumber() on untracked variable', () => {
    const input = named('const n = unknownBigNumber.toNumber();');
    const result = applyTransform(transform, input);
    expect(result).toContain('TODO(ethers-codemod)');
    expect(result).toContain('unknownBigNumber.toNumber()');
  });

  it('adds TODO comment for chained .toNumber() on arithmetic result', () => {
    const input = named("const r = BigNumber.from('100').add(someValue).toNumber();");
    const result = applyTransform(transform, input);
    expect(result).toContain('TODO(ethers-codemod)');
    expect(result).toContain('.toNumber()');
  });

  it('adds TODO comment above .toHexString() on untracked variable', () => {
    const input = named('const h = unknownBigNumber.toHexString();');
    const result = applyTransform(transform, input);
    expect(result).toContain('TODO(ethers-codemod)');
    expect(result).toContain('unknownBigNumber.toHexString()');
  });

  it('does NOT add TODO for .add() on untracked (too generic)', () => {
    const input = named('const r = someArray.add(1);');
    const result = applyTransform(transform, input);
    expect(result).not.toContain('TODO');
    expect(result).toContain('someArray.add(1)');
  });

  it('does not transform anything when no ethers import present', () => {
    const input = 'const n = someValue.toNumber();';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('bigNumber-to-bigint – import cleanup', () => {
  it('removes BigNumber from named import when transformed', () => {
    const input = named("const x = BigNumber.from('1');");
    const result = applyTransform(transform, input);
    expect(result).not.toContain('BigNumber');
    expect(result).not.toContain('import');
  });

  it('keeps other named imports when removing BigNumber', () => {
    const input = "import { BigNumber, Contract } from 'ethers';\nconst x = BigNumber.from('1');";
    const result = applyTransform(transform, input);
    expect(result).toContain("import { Contract } from 'ethers'");
    expect(result).not.toContain('BigNumber');
  });

  it('preserves namespace import (ethers.BigNumber is accessed via namespace)', () => {
    const input = ns("const x = ethers.BigNumber.from('1');");
    const result = applyTransform(transform, input);
    expect(result).toContain("import * as ethers from 'ethers'");
  });
});

describe('bigNumber-to-bigint – fixture: all patterns', () => {
  it('transforms full fixture correctly', () => {
    const input = readFixture('bigNumber-to-bigint', 'input.ts');
    const expected = readFixture('bigNumber-to-bigint', 'output.ts');
    expect(applyTransform(transform, input)).toBe(expected);
  });
});
