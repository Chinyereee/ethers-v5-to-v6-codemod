import transform from '../src/transforms/await-getSigner';
import { applyTransform, normalize } from './testHelper';

// In ethers v6, JsonRpcProvider#getSigner() and BrowserProvider#getSigner()
// return Promise<JsonRpcSigner>. In v5 they returned the signer directly.
const ns = (body: string) => `import * as ethers from 'ethers';\n${body}`;
const TODO = 'TODO(ethers-codemod)';

describe('await-getSigner – enclosing function is already async', () => {
  it('adds await', () => {
    expect(applyTransform(transform, ns('async function f() {\n  const s = provider.getSigner();\n}')))
      .toBe(normalize(ns('async function f() {\n  const s = await provider.getSigner();\n}')));
  });

  it('adds await in an async arrow', () => {
    expect(applyTransform(transform, ns('const f = async () => {\n  const s = provider.getSigner();\n};')))
      .toBe(normalize(ns('const f = async () => {\n  const s = await provider.getSigner();\n};')));
  });

  it('parenthesises a chained call: getSigner().getAddress()', () => {
    expect(applyTransform(transform, ns('async function f() {\n  return await provider.getSigner().getAddress();\n}')))
      .toBe(normalize(ns('async function f() {\n  return await (await provider.getSigner()).getAddress();\n}')));
  });

  it('works with getSigner(address) and an inline provider', () => {
    const out = applyTransform(
      transform,
      ns('async function f() {\n  const s = new ethers.BrowserProvider(w).getSigner(addr);\n}')
    );
    expect(out).toContain('const s = await new ethers.BrowserProvider(w).getSigner(addr);');
  });

  it('leaves an existing await alone (idempotent)', () => {
    const input = ns('async function f() {\n  const s = await provider.getSigner();\n}');
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});

describe('await-getSigner – non-async function is made async and flagged', () => {
  it('function declaration', () => {
    const out = applyTransform(transform, ns('function loadSigner() {\n  return provider.getSigner();\n}'));
    expect(out).toContain('async function loadSigner() {\n  return await provider.getSigner();\n}');
    expect(out).toContain(TODO);
    expect(out).toContain('loadSigner is now async');
  });

  it('arrow function assigned to a const', () => {
    const out = applyTransform(transform, ns('const load = () => {\n  const s = provider.getSigner();\n  return s;\n};'));
    expect(out).toContain('const load = async () => {\n  const s = await provider.getSigner();');
    expect(out).toContain('load is now async');
  });

  it('class method', () => {
    const out = applyTransform(
      transform,
      ns('class Wallet {\n  connect() {\n    this.signer = this.provider.getSigner();\n  }\n}')
    );
    expect(out).toContain('async connect() {');
    expect(out).toContain('this.signer = await this.provider.getSigner();');
    expect(out).toContain('connect is now async');
  });

  it('adds only one TODO for a function with two calls', () => {
    const out = applyTransform(
      transform,
      ns('function both() {\n  const a = p1.getSigner();\n  const b = p2.getSigner();\n}')
    );
    expect(out.split(TODO).length - 1).toBe(1);
    expect(out).toContain('const a = await p1.getSigner();');
    expect(out).toContain('const b = await p2.getSigner();');
  });

  it('is idempotent: a second run changes nothing', () => {
    const once = applyTransform(transform, ns('function loadSigner() {\n  return provider.getSigner();\n}'));
    expect(applyTransform(transform, once)).toBe(once);
  });
});

describe('await-getSigner – JSX event handlers', () => {
  it('makes an onClick handler async without a callers TODO (React ignores its return value)', () => {
    const out = applyTransform(
      transform,
      ns('const b = <button onClick={() => {\n  const s = provider.getSigner();\n}} />;')
    );
    expect(out).toContain('onClick={async () => {');
    expect(out).toContain('const s = await provider.getSigner();');
    expect(out).not.toContain(TODO);
  });
});

describe('await-getSigner – places where async would break code are flagged, not changed', () => {
  const unchangedButFlagged = (body: string) => {
    const out = applyTransform(transform, ns(body));
    expect(out).toContain(TODO);
    // The code itself is unchanged; only a comment line was added.
    const code = out.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).toBe(normalize(ns(body)));
  };

  it('constructor (cannot be async)', () => {
    unchangedButFlagged('class W {\n  constructor(p) {\n    this.signer = p.getSigner();\n  }\n}');
  });

  it('getter (cannot be async)', () => {
    unchangedButFlagged('class W {\n  get signer() {\n    return this.p.getSigner();\n  }\n}');
  });

  it('callback passed to another function (e.g. useEffect expects a sync function)', () => {
    unchangedButFlagged('useEffect(() => {\n  const s = provider.getSigner();\n}, []);');
  });

  it('React component (capitalised function)', () => {
    unchangedButFlagged('function App() {\n  const s = provider.getSigner();\n  return null;\n}');
  });

  it('React hook (useX function)', () => {
    unchangedButFlagged('function useSigner() {\n  return provider.getSigner();\n}');
  });

  it('module top level', () => {
    unchangedButFlagged('const signer = provider.getSigner();');
  });
});

describe('await-getSigner – scope', () => {
  it('does nothing without an ethers import (e.g. hardhat, which is already async)', () => {
    const input = "import { ethers } from 'hardhat';\nfunction f() {\n  return ethers.getSigner(addr);\n}";
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });

  it('ignores a getSigner property that is not called', () => {
    const input = ns('const fn = provider.getSigner;');
    expect(applyTransform(transform, input)).toBe(normalize(input));
  });
});
