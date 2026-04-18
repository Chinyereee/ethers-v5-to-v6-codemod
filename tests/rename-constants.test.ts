import transform from '../src/transforms/rename-constants';
import { applyTransform, normalize } from './testHelper';

const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;
const ds = (body: string) => `import { constants } from 'ethers';\n${body}`;

describe('rename-constants – namespace (ethers.constants.X)', () => {
  it('AddressZero → ZeroAddress', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.AddressZero;')))
      .toBe(normalize(ns('const x = ethers.ZeroAddress;')));
  });

  it('HashZero → ZeroHash', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.HashZero;')))
      .toBe(normalize(ns('const x = ethers.ZeroHash;')));
  });

  it('MaxUint256 → ethers.MaxUint256', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.MaxUint256;')))
      .toBe(normalize(ns('const x = ethers.MaxUint256;')));
  });

  it('MinInt256 → ethers.MinInt256', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.MinInt256;')))
      .toBe(normalize(ns('const x = ethers.MinInt256;')));
  });

  it('WeiPerEther → ethers.WeiPerEther', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.WeiPerEther;')))
      .toBe(normalize(ns('const x = ethers.WeiPerEther;')));
  });

  it('EtherSymbol → ethers.EtherSymbol', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.EtherSymbol;')))
      .toBe(normalize(ns('const x = ethers.EtherSymbol;')));
  });

  it('NegativeOne → -1n', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.NegativeOne;')))
      .toBe(normalize(ns('const x = -1n;')));
  });

  it('Zero → 0n', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.Zero;')))
      .toBe(normalize(ns('const x = 0n;')));
  });

  it('One → 1n', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.One;')))
      .toBe(normalize(ns('const x = 1n;')));
  });

  it('Two → 2n', () => {
    expect(applyTransform(transform, ns('const x = ethers.constants.Two;')))
      .toBe(normalize(ns('const x = 2n;')));
  });

  it('does not touch non-ethers constants', () => {
    const input = ns('const x = foo.constants.AddressZero;');
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('does not modify file with no ethers import', () => {
    const input = 'const x = something.constants.AddressZero;';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('rename-constants – destructured (import { constants })', () => {
  it('AddressZero → ethers.ZeroAddress, updates import', () => {
    expect(applyTransform(transform, ds('const x = constants.AddressZero;')))
      .toBe(normalize("import { ZeroAddress } from 'ethers';\nconst x = ethers.ZeroAddress;"));
  });

  it('HashZero → ethers.ZeroHash, updates import', () => {
    expect(applyTransform(transform, ds('const x = constants.HashZero;')))
      .toBe(normalize("import { ZeroHash } from 'ethers';\nconst x = ethers.ZeroHash;"));
  });

  it('Zero → 0n, removes import when nothing else imported', () => {
    expect(applyTransform(transform, ds('const x = constants.Zero;')))
      .toBe(normalize('const x = 0n;'));
  });

  it('NegativeOne → -1n', () => {
    expect(applyTransform(transform, ds('const x = constants.NegativeOne;')))
      .toBe(normalize('const x = -1n;'));
  });

  it('preserves other named imports alongside constants', () => {
    const input = "import { constants, Contract } from 'ethers';\nconst x = constants.AddressZero;";
    const result = applyTransform(transform, input);
    expect(result).toContain('ZeroAddress');
    expect(result).toContain('Contract');
    expect(result).not.toContain('constants');
  });

  it('deduplicates if v6 name already imported', () => {
    const input = "import { constants, ZeroAddress } from 'ethers';\nconst x = constants.AddressZero;";
    const result = applyTransform(transform, input);
    const importLine = result.split('\n')[0];
    const count = (importLine.match(/ZeroAddress/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('is idempotent – running twice gives same result', () => {
    const input = ns('const a = ethers.constants.AddressZero;\nconst b = ethers.constants.Zero;');
    const once = applyTransform(transform, input);
    const twice = applyTransform(transform, once);
    expect(twice).toBe(once);
  });
});
