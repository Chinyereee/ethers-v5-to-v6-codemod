import type { FileInfo, API, ASTPath, CallExpression, MemberExpression } from 'jscodeshift';

/**
 * provider.getSigner() → await provider.getSigner()
 *
 * In ethers v6, JsonRpcProvider#getSigner() and BrowserProvider#getSigner()
 * return Promise<JsonRpcSigner>; in v5 they returned the signer directly.
 *
 * Where the call sits decides what we do:
 *  - inside an async function             → add `await`
 *  - inside a plain named function/method → make it async, add `await`, and
 *                                           flag it: its callers now get a Promise
 *  - inside a JSX on* event handler        → make it async, add `await` (React
 *                                           ignores the handler's return value)
 *  - constructor, getter/setter, callback passed to another function, React
 *    component or hook, module top level   → leave the code alone and flag it,
 *                                           because `async` would break it
 *
 * Flags are `// TODO(ethers-codemod): ...` comments, which run.ts counts as
 * "needs AI review". Only files that import from 'ethers' are touched, so
 * hardhat's `ethers.getSigner()` (already async) is left alone.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPath = ASTPath<any>;

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassMethod',
  'ClassPrivateMethod',
  'ObjectMethod',
]);

const MARKER = 'TODO(ethers-codemod)';

type Plan =
  | { kind: 'await' }
  | { kind: 'make-async'; fn: AnyPath; name: string | null; flagCallers: boolean }
  | { kind: 'flag'; reason: string };

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  const importsEthers =
    root.find(j.ImportDeclaration, { source: { value: 'ethers' } }).size() > 0;
  if (!importsEthers) return file.source;

  const calls = root.find(j.CallExpression, (node: CallExpression) => {
    if (node.callee.type !== 'MemberExpression') return false;
    const mem = node.callee as MemberExpression;
    return (
      !mem.computed &&
      mem.property.type === 'Identifier' &&
      (mem.property as { name: string }).name === 'getSigner'
    );
  });
  if (calls.size() === 0) return file.source;

  // ── helpers ────────────────────────────────────────────────────────────────

  function enclosingFunction(path: AnyPath): AnyPath | null {
    let p: AnyPath | null = path.parent;
    while (p) {
      if (FUNCTION_TYPES.has(p.node.type)) return p;
      p = p.parent;
    }
    return null;
  }

  function functionName(fn: AnyPath): string | null {
    const n = fn.node;
    if (n.id?.name) return n.id.name;
    if ((n.type === 'ClassMethod' || n.type === 'ObjectMethod') && n.key?.type === 'Identifier') {
      return n.key.name;
    }
    if (n.type === 'ClassPrivateMethod') return n.key?.id?.name ?? null;
    const parent = fn.parent?.node;
    if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') return parent.id.name;
    if ((parent?.type === 'ObjectProperty' || parent?.type === 'ClassProperty') && parent.key?.type === 'Identifier') {
      return parent.key.name;
    }
    return null;
  }

  function isJsxEventHandler(fn: AnyPath): boolean {
    const container = fn.parent?.node;
    const attr = fn.parent?.parent?.node;
    return (
      container?.type === 'JSXExpressionContainer' &&
      attr?.type === 'JSXAttribute' &&
      attr.name?.type === 'JSXIdentifier' &&
      /^on[A-Z]/.test(attr.name.name)
    );
  }

  function isCallbackArgument(fn: AnyPath): boolean {
    const parent = fn.parent?.node;
    return (
      (parent?.type === 'CallExpression' || parent?.type === 'NewExpression') &&
      parent.arguments.includes(fn.node)
    );
  }

  function plan(path: AnyPath): Plan {
    const fn = enclosingFunction(path);
    if (!fn) {
      return { kind: 'flag', reason: 'await it inside an async function (top-level await needs ES modules)' };
    }
    const n = fn.node;
    if (n.async) return { kind: 'await' };

    const methodKind = n.kind as string | undefined;
    if (methodKind === 'constructor') {
      return { kind: 'flag', reason: 'a constructor cannot be async; move this into an async init() method' };
    }
    if (methodKind === 'get' || methodKind === 'set') {
      return { kind: 'flag', reason: 'a getter/setter cannot be async; turn it into an async method' };
    }
    if (n.generator) {
      return { kind: 'flag', reason: 'this is a generator; migrate it by hand' };
    }
    if (isJsxEventHandler(fn)) return { kind: 'make-async', fn, name: null, flagCallers: false };
    if (isCallbackArgument(fn)) {
      return { kind: 'flag', reason: 'this callback may need to stay synchronous (e.g. useEffect); resolve the signer with .then() or in an async helper' };
    }

    const name = functionName(fn);
    if (name && /^[A-Z]/.test(name)) {
      return { kind: 'flag', reason: 'React components cannot be async; get the signer in an effect or event handler' };
    }
    if (name && /^use[A-Z0-9]/.test(name)) {
      return { kind: 'flag', reason: 'React hooks cannot be async; get the signer in an effect inside the hook' };
    }
    if (!name) {
      return { kind: 'flag', reason: 'could not tell whether this function can safely be made async' };
    }
    return { kind: 'make-async', fn, name, flagCallers: true };
  }

  /** The node a leading comment should sit on: the method itself, or the enclosing statement. */
  function commentTarget(path: AnyPath): AnyPath | null {
    let p: AnyPath | null = path;
    while (p) {
      const t = p.node.type;
      if (t === 'ClassMethod' || t === 'ClassPrivateMethod' || t === 'ObjectMethod' || t === 'ClassProperty') return p;
      if (j.Statement.check(p.node) && t !== 'BlockStatement') return p;
      p = p.parent;
    }
    return null;
  }

  function addComment(path: AnyPath, text: string): void {
    const target = commentTarget(path);
    if (!target) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any[] = target.node.comments ?? [];
    if (existing.some((c) => c.value?.includes(MARKER) && c.value?.includes('getSigner'))) return;
    target.node.comments = [
      { type: 'CommentLine', value: ` ${MARKER}: ${text}`, leading: true, trailing: false },
      ...existing,
    ];
  }

  // ── rewrite ────────────────────────────────────────────────────────────────

  const flaggedAsync = new Set<unknown>();

  calls.forEach((path: AnyPath) => {
    if (path.parent?.node.type === 'AwaitExpression') return; // already migrated

    const p = plan(path);
    if (p.kind === 'flag') {
      addComment(path, `getSigner() returns a Promise in ethers v6; ${p.reason}`);
      return;
    }
    if (p.kind === 'make-async') {
      p.fn.node.async = true;
      if (p.flagCallers && !flaggedAsync.has(p.fn.node)) {
        flaggedAsync.add(p.fn.node);
        addComment(
          p.fn,
          `${p.name} is now async because getSigner() returns a Promise in ethers v6; await its callers`
        );
      }
    }
    path.replace(j.awaitExpression(path.node));
  });

  return root.toSource({ quote: 'single' });
}
