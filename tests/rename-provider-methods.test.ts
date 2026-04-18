import transform from '../src/transforms/rename-provider-methods';
import { applyTransform, normalize } from './testHelper';

const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;

describe('rename-provider-methods – sendTransaction → broadcastTransaction', () => {
  it('renames provider.sendTransaction to broadcastTransaction', () => {
    const input = 'const tx = await provider.sendTransaction(signedTx);';
    const result = applyTransform(transform, input);
    expect(result).toContain('broadcastTransaction(signedTx)');
    // 'sendTransaction' only appears inside the TODO comment, not as a call
    expect(result).not.toContain('sendTransaction(signedTx)');
  });

  it('adds TODO comment above the renamed line', () => {
    const input = 'const tx = await provider.sendTransaction(signedTx);';
    const result = applyTransform(transform, input);
    expect(result).toContain('TODO: ethers v6');
    expect(result).toContain('broadcastTransaction');
    expect(result).toContain('signer.sendTransaction');
  });

  it('signer.sendTransaction is also renamed and flagged with TODO for developer review', () => {
    const input = 'const receipt = await signer.sendTransaction(tx);';
    const result = applyTransform(transform, input);
    // Renamed — developer must review the TODO and revert if this is truly a signer call
    expect(result).toContain('broadcastTransaction(tx)');
    expect(result).toContain('TODO: ethers v6');
  });

  it('preserves all arguments', () => {
    const input = 'await provider.sendTransaction(signedTx);';
    const result = applyTransform(transform, input);
    expect(result).toContain('broadcastTransaction(signedTx)');
  });

  it('is idempotent – running twice gives same result', () => {
    const input = 'const tx = await provider.sendTransaction(signedTx);';
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
