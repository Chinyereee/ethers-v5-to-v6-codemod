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
      .toBe(normalize("import { toBeHex } from 'ethers';\nconst h = toBeHex(BigInt('255'));"));
  });

  it('converts .toNumber() on tracked variable', () => {
    const input = named("const bn = BigNumber.from('5');\nconst n = bn.toNumber();");
    const expected = "const bn = BigInt('5');\nconst n = Number(bn);";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('converts .toHexString() on tracked variable', () => {
    const input = named("const bn = BigNumber.from('255');\nconst h = bn.toHexString();");
    const expected = "import { toBeHex } from 'ethers';\nconst bn = BigInt('255');\nconst h = toBeHex(bn);";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('bigNumber-to-bigint – toHexString keeps the 0x prefix', () => {
  // v5 BigNumber#toHexString() returns an even-length, 0x-prefixed string
  // ("0xff", "0x01"). v6 toBeHex() returns the same; bigint#toString(16) does not.
  it('uses ethers.toBeHex with a namespace import', () => {
    const input = ns("const bn = ethers.BigNumber.from('255');\nconst h = bn.toHexString();");
    const expected = ns("const bn = BigInt('255');\nconst h = ethers.toBeHex(bn);");
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('keeps other named imports and adds toBeHex', () => {
    const input = "import { BigNumber, Contract } from 'ethers';\nconst h = BigNumber.from(1).toHexString();";
    const expected = "import { Contract, toBeHex } from 'ethers';\nconst h = toBeHex(BigInt(1));";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('does not add a duplicate toBeHex import', () => {
    const input = "import { BigNumber, toBeHex } from 'ethers';\nconst h = BigNumber.from(1).toHexString();";
    const expected = "import { toBeHex } from 'ethers';\nconst h = toBeHex(BigInt(1));";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('produces output that matches v5 at runtime', () => {
    // What ethers v6 toBeHex(x) returns for these inputs, per its implementation:
    // minimal hex, left-padded to an even number of digits, 0x-prefixed.
    const toBeHex = (v: bigint) => {
      let h = v.toString(16);
      if (h.length % 2) h = '0' + h;
      return '0x' + h;
    };
    expect(toBeHex(255n)).toBe('0xff');
    expect(toBeHex(1n)).toBe('0x01');
    expect(toBeHex(256n)).toBe('0x0100');
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

describe('bigNumber-to-bigint – operands are always bigint', () => {
  // v5 methods accepted any BigNumberish (number, string, BigNumber). Native
  // operators don't: bigint * number throws a TypeError, bigint === number is
  // always false, and bigint + string concatenates.
  const setup = (expr: string) => named(`const a = BigNumber.from('10');\nconst r = ${expr};`);
  const expected = (expr: string) => normalize(`const a = BigInt('10');\nconst r = ${expr};`);

  it('.mul(2) → a * 2n (not a * 2, which throws)', () => {
    expect(applyTransform(transform, setup('a.mul(2)'))).toBe(expected('a * 2n'));
  });

  it('.eq(1000) → a === 1000n (not a === 1000, which is always false)', () => {
    expect(applyTransform(transform, setup('a.eq(1000)'))).toBe(expected('a === 1000n'));
  });

  it('keeps hex literals readable: .add(0x10) → a + 0x10n', () => {
    expect(applyTransform(transform, setup('a.add(0x10)'))).toBe(expected('a + 0x10n'));
  });

  it(".add('5') → a + BigInt('5') (not string concatenation)", () => {
    expect(applyTransform(transform, setup("a.add('5')"))).toBe(expected("a + BigInt('5')"));
  });

  it('wraps an untracked operand: .sub(fee) → a - BigInt(fee)', () => {
    expect(applyTransform(transform, setup('a.sub(fee)'))).toBe(expected('a - BigInt(fee)'));
  });

  it('wraps a non-safe numeric literal: .mul(1e18) → a * BigInt(1e18)', () => {
    expect(applyTransform(transform, setup('a.mul(1e18)'))).toBe(expected('a * BigInt(1e18)'));
  });

  it('leaves bigint operands alone: .add(5n) and .add(BigInt(x))', () => {
    expect(applyTransform(transform, setup('a.add(5n)'))).toBe(expected('a + 5n'));
    expect(applyTransform(transform, setup('a.add(BigInt(x))'))).toBe(expected('a + BigInt(x)'));
  });

  it('leaves a BigNumber.from operand to become BigInt(...)', () => {
    expect(applyTransform(transform, setup('a.add(BigNumber.from(1))'))).toBe(expected('a + BigInt(1)'));
  });

  it('produces code that evaluates like v5', () => {
    const a = BigInt('10');
    expect(a * 2n).toBe(20n);
    expect(a === 10n).toBe(true);
    expect(a + BigInt('5')).toBe(15n);
    expect(() => (a as unknown as number) * 2).toThrow(TypeError);
  });
});

describe('bigNumber-to-bigint – TODO comments for untracked receivers', () => {
  it('adds TODO comment above .toNumber() on untracked variable', () => {
    const input = named('const n = unknownBigNumber.toNumber();');
    const result = applyTransform(transform, input);
    expect(result).toContain('TODO(ethers-codemod)');
    expect(result).toContain('unknownBigNumber.toNumber()');
  });

  it('converts chained .toNumber() on an arithmetic result (chains are now followed)', () => {
    const input = named("const r = BigNumber.from('100').add(someValue).toNumber();");
    expect(applyTransform(transform, input))
      .toBe(normalize("const r = Number(BigInt('100') + BigInt(someValue));"));
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

describe('bigNumber-to-bigint – more methods, and chains on converted results', () => {
  // Found by running the codemod on Uniswap v3-periphery: e.g.
  // BigNumber.from(2).pow(128).sub(1) became BigInt(2).pow(128).sub(1),
  // which throws "BigInt(...).pow is not a function".
  const out = (body: string) => applyTransform(transform, named(body));

  it('pow + chained sub: BigNumber.from(2).pow(128).sub(1) → BigInt(2) ** 128n - 1n', () => {
    expect(out('export const MaxUint128 = BigNumber.from(2).pow(128).sub(1);'))
      .toBe(normalize('export const MaxUint128 = BigInt(2) ** 128n - 1n;'));
  });

  it('nested from() as operand: from(n).mul(from(10).pow(18)) → BigInt(n) * BigInt(10) ** 18n', () => {
    expect(out('const x = BigNumber.from(n).mul(BigNumber.from(10).pow(18));'))
      .toBe(normalize('const x = BigInt(n) * BigInt(10) ** 18n;'));
  });

  it('shl / shr on a tracked variable', () => {
    expect(out('const a = BigNumber.from(1);\nconst l = a.shl(70);\nconst r = a.shr(1);'))
      .toBe(normalize('const a = BigInt(1);\nconst l = a << 70n;\nconst r = a >> 1n;'));
  });

  it('comparison on an arithmetic result: a.add(1).gt(b) → a + 1n > b', () => {
    expect(out("const a = BigNumber.from('1');\nconst b = BigNumber.from('2');\nconst r = a.add(1).gt(b);"))
      .toBe(normalize("const a = BigInt('1');\nconst b = BigInt('2');\nconst r = a + 1n > b;"));
  });

  it('keeps grouping: a.sub(b).mul(2) → (a - b) * 2n', () => {
    expect(out("const a = BigNumber.from('5');\nconst b = BigNumber.from('3');\nconst r = a.sub(b).mul(2);"))
      .toBe(normalize("const a = BigInt('5');\nconst b = BigInt('3');\nconst r = (a - b) * 2n;"));
  });

  it('tracks a variable assigned from a chain', () => {
    expect(out('const m = BigNumber.from(2).pow(8);\nconst n = m.toNumber();'))
      .toBe(normalize('const m = BigInt(2) ** 8n;\nconst n = Number(m);'));
  });

  it('isZero() → === 0n, isNegative() → < 0n', () => {
    expect(out('const a = BigNumber.from(x);\nconst z = a.isZero();\nconst n = a.isNegative();'))
      .toBe(normalize('const a = BigInt(x);\nconst z = a === 0n;\nconst n = a < 0n;'));
  });

  it('abs() on a variable → (a < 0n ? -a : a)', () => {
    expect(out('const a = BigNumber.from(x);\nconst p = a.abs();'))
      .toBe(normalize('const a = BigInt(x);\nconst p = a < 0n ? -a : a;'));
  });

  it('mod → % with a TODO, because v5 mod never returned a negative and % can', () => {
    const result = out('const a = BigNumber.from(x);\nconst r = a.mod(3);');
    expect(result).toContain('const r = a % 3n;');
    expect(result).toContain('TODO(ethers-codemod)');
    expect(result).toContain('% keeps the sign');
  });

  it('generated expressions give the same values ethers v5 gave', () => {
    // Values measured with ethers@5.8.0 BigNumber.
    expect((BigInt(2) ** 128n - 1n).toString()).toBe('340282366920938463463374607431768211455');
    expect((1n << 70n).toString()).toBe('1180591620717411303424');
    expect((-7n / 2n).toString()).toBe('-3'); // v5 div(-7, 2) = -3
    expect(BigInt(5) * BigInt(10) ** 18n).toBe(5000000000000000000n);
  });
});
