import transform from '../src/transforms/rename-provider-methods';
import { applyTransform, normalize } from './testHelper';

const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;

describe('rename-provider-methods – sendTransaction → broadcastTransaction', () => {
  // v5 provider.sendTransaction(signedTx) became broadcastTransaction in v6.
  // signer.sendTransaction(txRequest) is unchanged in v6 and is the common
  // case: renaming it broke Safe (signer.broadcastTransaction does not exist).
  it('renames provider.sendTransaction to broadcastTransaction', () => {
    const input = 'const tx = await provider.sendTransaction(signedTx);';
    expect(applyTransform(transform, input))
      .toBe(normalize('const tx = await provider.broadcastTransaction(signedTx);'));
  });

  it('recognises provider receivers by name: this.provider, hre.ethers.provider, signer.provider', () => {
    const input = [
      'await this.provider.sendTransaction(raw);',
      'await hre.ethers.provider.sendTransaction(raw);',
      'await wallet.provider.sendTransaction(raw);',
    ].join('\n');
    const out = applyTransform(transform, input);
    expect(out.match(/broadcastTransaction\(raw\)/g)).toHaveLength(3);
    expect(out).not.toContain('TODO');
  });

  it('leaves signer.sendTransaction alone (it still exists in v6)', () => {
    const input = 'const receipt = await signer.sendTransaction(tx);';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('leaves any call with a transaction-request object alone (Safe: deployer.sendTransaction({ data }))', () => {
    const input = 'const t = await deployer.sendTransaction({ data: output.data, gasLimit: 6000000 });';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('flags, without renaming, an unknown receiver with a non-object argument', () => {
    const out = applyTransform(transform, 'await thing.sendTransaction(payload);');
    expect(out).toContain('thing.sendTransaction(payload)');
    expect(out).toContain('TODO');
    expect(out).toContain('broadcastTransaction');
  });

  it('preserves all arguments', () => {
    const input = 'await provider.sendTransaction(signedTx);';
    expect(applyTransform(transform, input)).toContain('broadcastTransaction(signedTx)');
  });

  it('is idempotent – running twice gives same result', () => {
    const input = 'const tx = await provider.sendTransaction(signedTx);\nawait thing.sendTransaction(p);';
    const once = applyTransform(transform, input);
    const twice = applyTransform(transform, once);
    expect(twice).toBe(once);
  });
});

describe('rename-provider-methods – parseTransaction → Transaction.from()', () => {
  it('renames ethers.utils.parseTransaction → ethers.Transaction.from (namespace)', () => {
    expect(applyTransform(transform, ns('const tx = ethers.utils.parseTransaction(bytes);')))
      .toBe(normalize(ns('const tx = ethers.Transaction.from(bytes);')));
  });

  it('renames bare parseTransaction when imported from ethers', () => {
    const input = "import { parseTransaction } from 'ethers';\nconst tx = parseTransaction(bytes);";
    const result = applyTransform(transform, input);
    expect(result).toContain('Transaction.from(bytes)');
    expect(result).not.toContain('parseTransaction');
    expect(result).toContain('Transaction');
  });

  it('updates import: replaces parseTransaction with Transaction', () => {
    const input = "import { parseTransaction } from 'ethers';\nconst tx = parseTransaction(bytes);";
    const result = applyTransform(transform, input);
    const importLine = result.split('\n')[0];
    expect(importLine).toContain('Transaction');
    expect(importLine).not.toContain('parseTransaction');
  });

  it('does not duplicate Transaction import if already present', () => {
    const input = "import { parseTransaction, Transaction } from 'ethers';\nconst tx = parseTransaction(bytes);";
    const result = applyTransform(transform, input);
    const importLine = result.split('\n')[0];
    const count = (importLine.match(/Transaction/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not transform parseTransaction on non-ethers objects', () => {
    const input = ns('const tx = foo.utils.parseTransaction(bytes);');
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('rename-provider-methods – serializeTransaction → Transaction.from().serialized', () => {
  it('renames ethers.utils.serializeTransaction → ethers.Transaction.from(tx).serialized', () => {
    expect(applyTransform(transform, ns('const bytes = ethers.utils.serializeTransaction(tx);')))
      .toBe(normalize(ns('const bytes = ethers.Transaction.from(tx).serialized;')));
  });

  it('handles serializeTransaction with signature argument', () => {
    expect(applyTransform(transform, ns('const bytes = ethers.utils.serializeTransaction(tx, sig);')))
      .toBe(normalize(ns('const bytes = ethers.Transaction.from(tx, sig).serialized;')));
  });

  it('does not transform serializeTransaction on non-ethers utils', () => {
    const input = ns('const bytes = foo.utils.serializeTransaction(tx);');
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});
