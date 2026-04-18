import transform from '../src/transforms/rename-providers';
import { applyTransform, normalize, readFixture } from './testHelper';

const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;
const ds = (body: string) => `import { providers } from 'ethers';\n${body}`;

describe('rename-providers – namespace NewExpression (all 7 renames)', () => {
  it('Web3Provider → BrowserProvider', () => {
    expect(applyTransform(transform, ns('const p = new ethers.providers.Web3Provider(w);')))
      .toBe(normalize(ns('const p = new ethers.BrowserProvider(w);')));
  });

  it('JsonRpcProvider → JsonRpcProvider (same name)', () => {
    expect(applyTransform(transform, ns("const p = new ethers.providers.JsonRpcProvider('http://localhost');")))
      .toBe(normalize(ns("const p = new ethers.JsonRpcProvider('http://localhost');")));
  });

  it('WebSocketProvider → WebSocketProvider (same name)', () => {
    expect(applyTransform(transform, ns("const p = new ethers.providers.WebSocketProvider('wss://x');")))
      .toBe(normalize(ns("const p = new ethers.WebSocketProvider('wss://x');")));
  });

  it('FallbackProvider → FallbackProvider (same name)', () => {
    expect(applyTransform(transform, ns('const p = new ethers.providers.FallbackProvider([a, b]);')))
      .toBe(normalize(ns('const p = new ethers.FallbackProvider([a, b]);')));
  });

  it('StaticJsonRpcProvider → JsonRpcProvider (merged in v6) with TODO comment', () => {
    const result = applyTransform(transform, ns("const p = new ethers.providers.StaticJsonRpcProvider('http://localhost');"));
    expect(result).toContain("new ethers.JsonRpcProvider('http://localhost')");
    expect(result).toContain('TODO: ethers v6');
    expect(result).toContain('staticNetwork');
  });

  it('AlchemyProvider → AlchemyProvider (same name)', () => {
    expect(applyTransform(transform, ns("const p = new ethers.providers.AlchemyProvider('mainnet', key);")))
      .toBe(normalize(ns("const p = new ethers.AlchemyProvider('mainnet', key);")));
  });

  it('InfuraProvider → InfuraProvider (same name)', () => {
    expect(applyTransform(transform, ns("const p = new ethers.providers.InfuraProvider('mainnet', id);")))
      .toBe(normalize(ns("const p = new ethers.InfuraProvider('mainnet', id);")));
  });
});

describe('rename-providers – TypeScript type annotations', () => {
  it('ethers.providers.Web3Provider type → ethers.BrowserProvider', () => {
    expect(applyTransform(transform, ns('let p: ethers.providers.Web3Provider;')))
      .toBe(normalize(ns('let p: ethers.BrowserProvider;')));
  });

  it('ethers.providers.JsonRpcProvider type → ethers.JsonRpcProvider', () => {
    expect(applyTransform(transform, ns('let p: ethers.providers.JsonRpcProvider;')))
      .toBe(normalize(ns('let p: ethers.JsonRpcProvider;')));
  });

  it('ethers.providers.StaticJsonRpcProvider type → ethers.JsonRpcProvider', () => {
    expect(applyTransform(transform, ns('let p: ethers.providers.StaticJsonRpcProvider;')))
      .toBe(normalize(ns('let p: ethers.JsonRpcProvider;')));
  });

  it('handles type annotation in function parameter', () => {
    expect(applyTransform(transform, ns('function f(p: ethers.providers.Web3Provider) {}')))
      .toBe(normalize(ns('function f(p: ethers.BrowserProvider) {}')));
  });

  it('handles type annotation in return type', () => {
    expect(applyTransform(transform, ns('function f(): ethers.providers.JsonRpcProvider { return null; }')))
      .toBe(normalize(ns('function f(): ethers.JsonRpcProvider { return null; }')));
  });
});

describe('rename-providers – destructured providers import', () => {
  it('replaces new providers.Web3Provider, removes providers, adds BrowserProvider', () => {
    expect(applyTransform(transform, ds('const p = new providers.Web3Provider(w);')))
      .toBe(normalize("import { BrowserProvider } from 'ethers';\nconst p = new BrowserProvider(w);"));
  });

  it('replaces new providers.JsonRpcProvider, adds JsonRpcProvider to import', () => {
    expect(applyTransform(transform, ds("const p = new providers.JsonRpcProvider('http://localhost');")))
      .toBe(normalize("import { JsonRpcProvider } from 'ethers';\nconst p = new JsonRpcProvider('http://localhost');"));
  });

  it('replaces providers type annotation with bare name', () => {
    expect(applyTransform(transform, ds('let p: providers.Web3Provider;')))
      .toBe(normalize("import { BrowserProvider } from 'ethers';\nlet p: BrowserProvider;"));
  });

  it('preserves other imports and deduplicates v6 names', () => {
    const input = "import { providers, Contract } from 'ethers';\nconst p = new providers.Web3Provider(w);";
    const result = applyTransform(transform, input);
    expect(result).toContain('BrowserProvider');
    expect(result).toContain('Contract');
    expect(result).not.toContain('providers');
  });

  it('deduplicates if v6 name already imported', () => {
    const input = "import { providers, BrowserProvider } from 'ethers';\nconst p = new providers.Web3Provider(w);";
    const result = applyTransform(transform, input);
    const importLine = result.split('\n')[0];
    const count = (importLine.match(/BrowserProvider/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('does not modify file with no ethers import', () => {
    const input = 'const p = new SomeProvider(w);';
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('rename-providers – fixture: all 7 providers + types', () => {
  it('transforms all patterns in one pass', () => {
    const input = readFixture('rename-providers', 'input.ts');
    const expected = readFixture('rename-providers', 'output.ts');
    expect(applyTransform(transform, input)).toBe(expected);
  });
});
