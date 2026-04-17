import transform from '../src/transforms/gasPrice-to-feeData';
import { applyTransform, normalize, readFixture } from './testHelper';

describe('gasPrice-to-feeData – await wrapping', () => {
  it('await provider.getGasPrice() → (await provider.getFeeData()).gasPrice', () => {
    const input = 'const gas = await provider.getGasPrice();';
    const expected = 'const gas = (await provider.getFeeData()).gasPrice;';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('await signer.getGasPrice() → (await signer.getFeeData()).gasPrice', () => {
    const input = 'const gas = await signer.getGasPrice();';
    const expected = 'const gas = (await signer.getFeeData()).gasPrice;';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('handles chained receiver: await provider.connect(s).getGasPrice()', () => {
    const input = 'const gas = await provider.connect(s).getGasPrice();';
    const expected = 'const gas = (await provider.connect(s).getFeeData()).gasPrice;';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('handles usage in return statement', () => {
    const input = 'async function f() { return await provider.getGasPrice(); }';
    const expected = 'async function f() { return (await provider.getFeeData()).gasPrice; }';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('gasPrice-to-feeData – inside transaction objects (case 3)', () => {
  it('transforms gasPrice property in transaction object', () => {
    const input = `const tx = await signer.sendTransaction({
  to: addr,
  gasPrice: await provider.getGasPrice(),
});`;
    const expected = `const tx = await signer.sendTransaction({
  to: addr,
  gasPrice: (await provider.getFeeData()).gasPrice,
});`;
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('transforms multiple getGasPrice calls in the same object', () => {
    const input = `const opts = {
  maxGas: await provider.getGasPrice(),
  fallback: await provider.getGasPrice(),
};`;
    const expected = `const opts = {
  maxGas: (await provider.getFeeData()).gasPrice,
  fallback: (await provider.getFeeData()).gasPrice,
};`;
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('gasPrice-to-feeData – non-await TODO comments', () => {
  it('adds TODO comment when getGasPrice() is called without await', () => {
    const input = 'const p = provider.getGasPrice();';
    const result = applyTransform(transform, input);
    expect(result).toContain('TODO: ethers v6');
    expect(result).toContain('getFeeData()');
    expect(result).toContain('provider.getGasPrice()');
  });

  it('TODO comment mentions all three fee fields', () => {
    const input = 'const p = provider.getGasPrice();';
    const result = applyTransform(transform, input);
    expect(result).toContain('.gasPrice');
    expect(result).toContain('.maxFeePerGas');
    expect(result).toContain('.maxPriorityFeePerGas');
  });

  it('does not add duplicate TODO when same line already has one', () => {
    // Apply the transform twice — second run should not add a second comment
    const input = 'const p = provider.getGasPrice();';
    const once = applyTransform(transform, input);
    const twice = applyTransform(transform, once);
    const commentCount = (twice.match(/TODO: ethers v6/g) ?? []).length;
    expect(commentCount).toBe(1);
  });

  it('does not add TODO to already-transformed await calls', () => {
    const input = 'const gas = await provider.getGasPrice();';
    const result = applyTransform(transform, input);
    expect(result).not.toContain('TODO');
    expect(result).toContain('getFeeData()');
  });
});

describe('gasPrice-to-feeData – FeeData type annotation', () => {
  it('ethers.providers.FeeData → ethers.FeeData', () => {
    const input = 'let fd: ethers.providers.FeeData;';
    const expected = 'let fd: ethers.FeeData;';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });

  it('handles FeeData in function return type', () => {
    const input = 'async function f(): Promise<ethers.providers.FeeData> { return null; }';
    const expected = 'async function f(): Promise<ethers.FeeData> { return null; }';
    expect(applyTransform(transform, input)).toBe(normalize(expected));
  });
});

describe('gasPrice-to-feeData – fixture: full async function', () => {
  it('transforms all patterns in fixture correctly', () => {
    const input = readFixture('gasPrice-to-feeData', 'input.ts');
    const expected = readFixture('gasPrice-to-feeData', 'output.ts');
    expect(applyTransform(transform, input)).toBe(expected);
  });
});
