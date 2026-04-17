import transform from '../src/transforms/update-imports';
import { applyTransform, normalize } from './testHelper';

describe('update-imports – removes deprecated v5 specifiers', () => {
  it('removes utils from named import', () => {
    const input = "import { utils, ethers } from 'ethers';";
    const expected = "import { ethers } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('removes BigNumber from named import', () => {
    const input = "import { BigNumber, Contract } from 'ethers';";
    const expected = "import { Contract } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('removes providers from named import', () => {
    const input = "import { providers, Signer } from 'ethers';";
    const expected = "import { Signer } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('removes all three deprecated names at once', () => {
    const input = "import { utils, BigNumber, providers } from 'ethers';";
    expect(applyTransform(transform, input)).toBe('');
  });

  it('removes entire import declaration when all specifiers are deprecated', () => {
    const input = "import { utils } from 'ethers';\nconst x = 1;";
    const expected = 'const x = 1;';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('update-imports – keeps valid v6 specifiers', () => {
  it('keeps ethers specifier', () => {
    const input = "import { ethers } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('keeps Signer (still exists as abstract in v6)', () => {
    const input = "import { Signer } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('keeps Contract', () => {
    const input = "import { Contract } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('keeps namespace import (import * as ethers) unchanged', () => {
    const input = "import * as ethers from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('keeps default import unchanged', () => {
    const input = "import ethers from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('keeps v6 provider names added by rename-providers', () => {
    const input = "import { BrowserProvider, JsonRpcProvider, Contract } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('update-imports – mixed: removes deprecated, keeps valid', () => {
  it('strips utils and BigNumber, keeps ethers, Contract, Signer', () => {
    const input = "import { utils, BigNumber, providers, ethers, Contract, Signer } from 'ethers';";
    const expected = "import { ethers, Contract, Signer } from 'ethers';";
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('does not touch non-ethers imports', () => {
    const input = "import { utils } from 'some-other-lib';";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('handles file with no ethers import gracefully', () => {
    const input = "const x = 1;";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('is idempotent – running twice gives same result', () => {
    const input = "import { utils, Contract, Signer } from 'ethers';";
    const once = applyTransform(transform, input);
    const twice = applyTransform(transform, once);
    expect(twice).toBe(once);
  });
});
