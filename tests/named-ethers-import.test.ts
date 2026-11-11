import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import renameUtils from '../src/transforms/rename-utils';
import bigNumberToBigint from '../src/transforms/bigNumber-to-bigint';
import renameProviders from '../src/transforms/rename-providers';
import renameConstants from '../src/transforms/rename-constants';
import renameProviderMethods from '../src/transforms/rename-provider-methods';
import { runAll } from '../src/transforms';
import { applyTransform, normalize } from './testHelper';

// `import { ethers } from 'ethers'` is the style the ethers v5 docs use.
// It must be treated like `import * as ethers from 'ethers'`.
const named = (body: string) => `import { ethers } from 'ethers';\n${body}`;

describe("import { ethers } from 'ethers'", () => {
  it('rename-utils: ethers.utils.parseEther → ethers.parseEther', () => {
    expect(applyTransform(renameUtils, named("const v = ethers.utils.parseEther('1.0');")))
      .toBe(normalize(named("const v = ethers.parseEther('1.0');")));
  });

  it('rename-providers: new ethers.providers.Web3Provider → new ethers.BrowserProvider', () => {
    expect(applyTransform(renameProviders, named('const p = new ethers.providers.Web3Provider(window.ethereum);')))
      .toBe(normalize(named('const p = new ethers.BrowserProvider(window.ethereum);')));
  });

  it('rename-providers: type annotations too', () => {
    expect(applyTransform(renameProviders, named('let p: ethers.providers.JsonRpcProvider;')))
      .toBe(normalize(named('let p: ethers.JsonRpcProvider;')));
  });

  it('rename-constants: ethers.constants.AddressZero → ethers.ZeroAddress', () => {
    expect(applyTransform(renameConstants, named('const z = ethers.constants.AddressZero;')))
      .toBe(normalize(named('const z = ethers.ZeroAddress;')));
  });

  it('bigNumber-to-bigint: ethers.BigNumber.from(x) → BigInt(x)', () => {
    expect(applyTransform(bigNumberToBigint, named("const b = ethers.BigNumber.from('5');")))
      .toBe(normalize(named("const b = BigInt('5');")));
  });

  it('bigNumber-to-bigint: toHexString uses ethers.toBeHex, no extra import', () => {
    expect(applyTransform(bigNumberToBigint, named("const b = ethers.BigNumber.from('5');\nconst h = b.toHexString();")))
      .toBe(normalize(named("const b = BigInt('5');\nconst h = ethers.toBeHex(b);")));
  });

  it('rename-provider-methods: ethers.utils.parseTransaction → ethers.Transaction.from', () => {
    const out = applyTransform(renameProviderMethods, named('const tx = ethers.utils.parseTransaction(raw);'));
    expect(out).toContain('ethers.Transaction.from(raw)');
  });

  it('does not treat an aliased import { ethers as e } as the ethers namespace', () => {
    const input = "import { ethers as e } from 'ethers';\nconst v = ethers.utils.parseEther('1');";
    expect(applyTransform(renameUtils, input)).toBe(normalize(input));
  });

  it('runAll: constants.MaxUint256.div(2) → MaxUint256 / 2n (Uniswap CallbackValidation.spec.ts)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'constants-'));
    const file = path.join(dir, 'a.ts');
    writeFileSync(file, "import { constants, Contract } from 'ethers';\nconst t = deploy(constants.MaxUint256.div(2));");
    try {
      expect(normalize(runAll(file, { writeBack: false }).source)).toBe(
        normalize("import { Contract, MaxUint256 } from 'ethers';\nconst t = deploy(MaxUint256 / 2n);")
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runAll migrates a typical v5 file end to end', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'named-ethers-'));
    const file = path.join(dir, 'app.ts');
    writeFileSync(
      file,
      [
        "import { ethers } from 'ethers';",
        'const provider = new ethers.providers.Web3Provider(window.ethereum);',
        "const value = ethers.utils.parseEther('1.0');",
        'const zero = ethers.constants.AddressZero;',
      ].join('\n')
    );
    try {
      const { source } = runAll(file, { writeBack: false });
      expect(normalize(source)).toBe(
        normalize(
          [
            "import { ethers } from 'ethers';",
            'const provider = new ethers.BrowserProvider(window.ethereum);',
            "const value = ethers.parseEther('1.0');",
            'const zero = ethers.ZeroAddress;',
          ].join('\n')
        )
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
