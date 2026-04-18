import transform from '../src/transforms/rename-contract-methods';
import { applyTransform, normalize } from './testHelper';

describe('rename-contract-methods – bucket renames', () => {
  it('callStatic.foo() → foo.staticCall()', () => {
    const input = 'const result = await contract.callStatic.balanceOf(addr);';
    const expected = 'const result = await contract.balanceOf.staticCall(addr);';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('estimateGas.foo() → foo.estimateGas()', () => {
    const input = 'const gas = await contract.estimateGas.transfer(to, amount);';
    const expected = 'const gas = await contract.transfer.estimateGas(to, amount);';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('populateTransaction.foo() → foo.populateTransaction()', () => {
    const input = 'const tx = await contract.populateTransaction.approve(spender, amount);';
    const expected = 'const tx = await contract.approve.populateTransaction(spender, amount);';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('functions.foo() → foo.staticCallResult()', () => {
    const input = 'const res = await contract.functions.getOwner();';
    const expected = 'const res = await contract.getOwner.staticCallResult();';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('rename-contract-methods – receiver name is irrelevant', () => {
  it('works with any variable name, not just "contract"', () => {
    const input = 'const x = await token.callStatic.allowance(owner, spender);';
    const expected = 'const x = await token.allowance.staticCall(owner, spender);';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('works with this.contract chained receiver', () => {
    const input = 'const x = await this.contract.callStatic.foo(a, b);';
    const expected = 'const x = await this.contract.foo.staticCall(a, b);';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('rename-contract-methods – arguments preserved', () => {
  it('passes through zero arguments', () => {
    const input = 'const x = await contract.callStatic.totalSupply();';
    const expected = 'const x = await contract.totalSupply.staticCall();';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('passes through multiple arguments', () => {
    const input = 'const x = await contract.callStatic.swap(a, b, c, d);';
    const expected = 'const x = await contract.swap.staticCall(a, b, c, d);';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('rename-contract-methods – mixed usage in one file', () => {
  it('transforms all 4 buckets in a single file', () => {
    const input = [
      'const r1 = await contract.callStatic.foo();',
      'const r2 = await contract.estimateGas.bar(x);',
      'const r3 = await contract.populateTransaction.baz(x, y);',
      'const r4 = await contract.functions.qux();',
    ].join('\n');
    const expected = [
      'const r1 = await contract.foo.staticCall();',
      'const r2 = await contract.bar.estimateGas(x);',
      'const r3 = await contract.baz.populateTransaction(x, y);',
      'const r4 = await contract.qux.staticCallResult();',
    ].join('\n');
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('rename-contract-methods – does NOT transform non-bucket patterns', () => {
  it('does not touch a regular 2-level call like provider.estimateGas(tx)', () => {
    const input = 'const gas = await provider.estimateGas(tx);';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('does not touch 3-level call where middle is not a bucket name', () => {
    const input = 'const x = await contract.utils.parseEther(v);';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('does not touch non-call member access', () => {
    const input = 'const f = contract.callStatic.balanceOf;';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('is idempotent – running twice gives same result', () => {
    const input = 'const x = await contract.callStatic.foo(a);';
    const once = applyTransform(transform, input);
    const twice = applyTransform(transform, once);
    expect(twice).toBe(once);
  });
});
