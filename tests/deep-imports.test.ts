import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import transform from '../src/transforms/deep-imports';
import { runAll } from '../src/transforms';
import { applyTransform, normalize } from './testHelper';

// ethers v6 has no `ethers/lib/*` paths, and the v5 `@ethersproject/*`
// sub-packages are not its dependencies. Everything comes from 'ethers'.
const TODO = 'TODO(ethers-codemod)';

describe('deep-imports – ethers/lib/utils', () => {
  it('splitSignature(x) → Signature.from(x)', () => {
    expect(applyTransform(transform, "import { splitSignature } from 'ethers/lib/utils';\nconst s = splitSignature(sig);"))
      .toBe(normalize("import { Signature } from 'ethers';\nconst s = Signature.from(sig);"));
  });

  it('merges into an existing ethers import and drops the deep one (Uniswap permit.ts)', () => {
    const input = [
      "import { BigNumberish, Wallet } from 'ethers'",
      "import { splitSignature } from 'ethers/lib/utils'",
      'export const f = (raw: string) => splitSignature(raw)',
    ].join('\n');
    expect(applyTransform(transform, input)).toBe(
      normalize(
        [
          "import { BigNumberish, Wallet, Signature } from 'ethers';",
          'export const f = (raw: string) => Signature.from(raw)',
        ].join('\n')
      )
    );
  });

  it('applies v6 renames and keeps unchanged names', () => {
    expect(applyTransform(transform, "import { arrayify, keccak256 } from 'ethers/lib/utils';\nconst a = keccak256(arrayify(x));"))
      .toBe(normalize("import { getBytes, keccak256 } from 'ethers';\nconst a = keccak256(getBytes(x));"));
  });

  it('keeps a local alias: { arrayify as toBytes } → { getBytes as toBytes }', () => {
    expect(applyTransform(transform, "import { arrayify as toBytes } from 'ethers/lib/utils';\nconst b = toBytes(x);"))
      .toBe(normalize("import { getBytes as toBytes } from 'ethers';\nconst b = toBytes(x);"));
  });

  it('joinSignature(x) → Signature.from(x).serialized', () => {
    expect(applyTransform(transform, "import { joinSignature } from 'ethers/lib/utils';\nconst s = joinSignature(parts);"))
      .toBe(normalize("import { Signature } from 'ethers';\nconst s = Signature.from(parts).serialized;"));
  });

  it('defaultAbiCoder → AbiCoder.defaultAbiCoder()', () => {
    expect(applyTransform(transform, "import { defaultAbiCoder } from 'ethers/lib/utils';\nconst d = defaultAbiCoder.encode(t, v);"))
      .toBe(normalize("import { AbiCoder } from 'ethers';\nconst d = AbiCoder.defaultAbiCoder().encode(t, v);"));
  });

  it('flags a namespace import instead of guessing', () => {
    const input = "import * as utils from 'ethers/lib/utils';\nconst a = utils.arrayify(x);";
    const out = applyTransform(transform, input);
    expect(out).toContain(TODO);
    expect(out).toContain("import * as utils from 'ethers/lib/utils'");
  });
});

describe('deep-imports – @ethersproject/* packages', () => {
  it('abstract-provider types move to ethers (Uniswap snapshotGasCost.ts)', () => {
    expect(applyTransform(transform, "import { TransactionReceipt, TransactionResponse } from '@ethersproject/abstract-provider';\nlet r: TransactionReceipt;"))
      .toBe(normalize("import { TransactionReceipt, TransactionResponse } from 'ethers';\nlet r: TransactionReceipt;"));
  });

  it('contracts: Contract moves to ethers (Uniswap externalFixtures.ts)', () => {
    expect(applyTransform(transform, "import { Contract } from '@ethersproject/contracts';\nlet c: Contract;"))
      .toBe(normalize("import { Contract } from 'ethers';\nlet c: Contract;"));
  });

  it('providers: Web3Provider → BrowserProvider, in values and types', () => {
    expect(applyTransform(transform, "import { Web3Provider } from '@ethersproject/providers';\nconst p: Web3Provider = new Web3Provider(w);"))
      .toBe(normalize("import { BrowserProvider } from 'ethers';\nconst p: BrowserProvider = new BrowserProvider(w);"));
  });

  it('constants: AddressZero → ZeroAddress, Zero → 0n', () => {
    expect(applyTransform(transform, "import { AddressZero, Zero } from '@ethersproject/constants';\nconst a = AddressZero;\nconst z = Zero;"))
      .toBe(normalize("import { ZeroAddress } from 'ethers';\nconst a = ZeroAddress;\nconst z = 0n;"));
  });

  it('keeps and flags a name that v6 does not export', () => {
    const out = applyTransform(transform, "import { Logger } from '@ethersproject/logger';\nconst l = new Logger('x');");
    expect(out).toContain("import { Logger } from '@ethersproject/logger'");
    expect(out).toContain(TODO);
  });

  it('leaves files without deep imports untouched', () => {
    const input = "import { Contract } from 'ethers';\nlet c: Contract;";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('deep-imports – in the full pipeline', () => {
  it('BigNumber from @ethersproject/bignumber is migrated by the BigNumber transform', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'deep-imports-'));
    const file = path.join(dir, 'a.ts');
    writeFileSync(file, "import { BigNumber } from '@ethersproject/bignumber';\nexport const a: BigNumber = BigNumber.from(1).add(2);");
    try {
      expect(normalize(runAll(file, { writeBack: false }).source))
        .toBe(normalize('export const a: bigint = BigInt(1) + 2n;'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
