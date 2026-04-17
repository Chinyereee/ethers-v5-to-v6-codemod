import type {
  FileInfo,
  API,
  ASTPath,
  CallExpression,
  MemberExpression,
  Expression,
  ImportDeclaration,
} from 'jscodeshift';

// BigNumber instance methods that become binary operators
const BN_BINARY_OPS: Record<string, string> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  eq: '===',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

// Methods that are BigNumber-specific enough to warrant a TODO comment when
// we see them on an untracked receiver (not worth doing for add/sub/etc.)
const BN_SPECIFIC_METHODS = new Set(['toNumber', 'toHexString']);

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  // ── Detect import style ────────────────────────────────────────────────────
  let hasBigNumberImport = false; // import { BigNumber } from 'ethers'
  let hasEthersNamespace = false; // import * as ethers / import ethers from 'ethers'

  const ethersImports = root.find(j.ImportDeclaration, (node: ImportDeclaration) =>
    node.source.value === 'ethers'
  );

  ethersImports.forEach((path) => {
    for (const spec of path.node.specifiers ?? []) {
      if (
        spec.type === 'ImportNamespaceSpecifier' ||
        spec.type === 'ImportDefaultSpecifier'
      ) {
        hasEthersNamespace = true;
      } else if (
        spec.type === 'ImportSpecifier' &&
        spec.imported.type === 'Identifier' &&
        (spec.imported as { name: string }).name === 'BigNumber'
      ) {
        hasBigNumberImport = true;
      }
    }
  });

  if (!hasBigNumberImport && !hasEthersNamespace) {
    return root.toSource({ quote: 'single' });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** True if node is `BigNumber.from(...)` or `ethers.BigNumber.from(...)`. */
  function isBigNumberFromCall(node: Expression): node is CallExpression {
    if (node.type !== 'CallExpression') return false;
    const call = node as CallExpression;
    const callee = call.callee;
    if (callee.type !== 'MemberExpression') return false;
    const mem = callee as MemberExpression;
    if (
      mem.property.type !== 'Identifier' ||
      (mem.property as { name: string }).name !== 'from'
    ) return false;

    // BigNumber.from(x)
    if (
      hasBigNumberImport &&
      mem.object.type === 'Identifier' &&
      (mem.object as { name: string }).name === 'BigNumber'
    ) return true;

    // ethers.BigNumber.from(x)
    if (hasEthersNamespace && mem.object.type === 'MemberExpression') {
      const inner = mem.object as MemberExpression;
      return (
        inner.object.type === 'Identifier' &&
        (inner.object as { name: string }).name === 'ethers' &&
        inner.property.type === 'Identifier' &&
        (inner.property as { name: string }).name === 'BigNumber'
      );
    }

    return false;
  }

  /** Build `BigInt(<args>)` from an existing BigNumber.from() call node. */
  function bigIntCallFrom(bnFromCall: CallExpression): CallExpression {
    return j.callExpression(j.identifier('BigInt'), bnFromCall.arguments);
  }

  /**
   * Collect variable names that are *definitively* assigned from BigNumber.from().
   * Conservative: only direct const/let/var declarations and simple assignments.
   */
  const knownBigNumbers = new Set<string>();

  root.find(j.VariableDeclarator).forEach((path) => {
    const { id, init } = path.node;
    if (
      id.type === 'Identifier' &&
      init != null &&
      isBigNumberFromCall(init as Expression)
    ) {
      knownBigNumbers.add((id as { name: string }).name);
    }
  });

  root.find(j.AssignmentExpression).forEach((path) => {
    const { left, right } = path.node;
    if (
      left.type === 'Identifier' &&
      isBigNumberFromCall(right as Expression)
    ) {
      knownBigNumbers.add((left as { name: string }).name);
    }
  });

  /** True if the expression is a tracked BigNumber value. */
  function isKnownBigNumber(node: Expression): boolean {
    return (
      isBigNumberFromCall(node) ||
      (node.type === 'Identifier' &&
        // Double-cast through unknown: the jscodeshift Expression union doesn't
        // narrow to Identifier automatically, but we've already checked the type.
        knownBigNumbers.has((node as unknown as { name: string }).name))
    );
  }

  /**
   * Resolve the "left-hand" operand: if the receiver is a direct BigNumber.from()
   * call, convert it to BigInt() so the resulting expression is valid.
   * Returns `any` to stay compatible with both Expression and ExpressionKind
   * call-sites (ast-types uses ExpressionKind; jscodeshift exports Expression).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function resolveReceiver(obj: Expression): any {
    return isBigNumberFromCall(obj) ? bigIntCallFrom(obj as CallExpression) : obj;
  }

  /**
   * Walk up the path chain to find the nearest Statement node and prepend a
   * TODO line comment.  Idempotent — won't add twice.
   */
  function addTodoComment(path: ASTPath<unknown>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: ASTPath<any> = path as ASTPath<any>;
    while (current.parent && !j.Statement.check(current.node)) {
      current = current.parent;
    }
    if (!j.Statement.check(current.node)) return;

    // Use `any[]` to avoid fighting ast-types' CommentKind discriminated union.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any[] = current.node.comments ?? [];
    if (existing.some((c: { value?: string }) => c.value?.includes('ethers-codemod'))) return;

    current.node.comments = [
      {
        type: 'CommentLine',
        value: ' TODO(ethers-codemod): verify this BigNumber method call and migrate manually',
        leading: true,
        trailing: false,
      },
      ...existing,
    ];
  }

  // ── Step 1 — Transform method calls on confirmed BigNumbers ───────────────
  // Must run BEFORE the standalone BigNumber.from() → BigInt() pass so that
  // chained calls like `BigNumber.from(x).toNumber()` are handled atomically.

  // .toNumber() → Number(x)
  root
    .find(j.CallExpression, (node: CallExpression): boolean =>
      node.callee.type === 'MemberExpression' &&
      (node.callee as MemberExpression).property.type === 'Identifier' &&
      ((node.callee as MemberExpression).property as { name: string }).name === 'toNumber' &&
      node.arguments.length === 0
    )
    .forEach((path: ASTPath<CallExpression>) => {
      const obj = ((path.node.callee as MemberExpression).object) as Expression;
      if (isKnownBigNumber(obj)) {
        path.replace(j.callExpression(j.identifier('Number'), [resolveReceiver(obj)]));
      } else {
        addTodoComment(path);
      }
    });

  // .toHexString() → .toString(16)
  root
    .find(j.CallExpression, (node: CallExpression): boolean =>
      node.callee.type === 'MemberExpression' &&
      (node.callee as MemberExpression).property.type === 'Identifier' &&
      ((node.callee as MemberExpression).property as { name: string }).name === 'toHexString' &&
      node.arguments.length === 0
    )
    .forEach((path: ASTPath<CallExpression>) => {
      const obj = ((path.node.callee as MemberExpression).object) as Expression;
      if (isKnownBigNumber(obj)) {
        path.replace(
          j.callExpression(
            j.memberExpression(resolveReceiver(obj), j.identifier('toString')),
            [j.numericLiteral(16)]
          )
        );
      } else {
        addTodoComment(path);
      }
    });

  // .add() / .sub() / .mul() / .div() / .eq() / .gt() / .gte() / .lt() / .lte()
  for (const [methodName, operator] of Object.entries(BN_BINARY_OPS)) {
    root
      .find(j.CallExpression, (node: CallExpression): boolean =>
        node.callee.type === 'MemberExpression' &&
        (node.callee as MemberExpression).property.type === 'Identifier' &&
        ((node.callee as MemberExpression).property as { name: string }).name === methodName &&
        node.arguments.length === 1
      )
      .forEach((path: ASTPath<CallExpression>) => {
        const obj = ((path.node.callee as MemberExpression).object) as Expression;
        if (!isKnownBigNumber(obj)) {
          // .add/.sub etc. are too generic to add a TODO — just skip silently
          return;
        }
        const left = resolveReceiver(obj);
        // Cast through any: jscodeshift's Expression and ast-types' ExpressionKind
        // are structurally incompatible in newer @types/jscodeshift (TSInstantiationExpression
        // is in ExpressionKind but not in jscodeshift's re-export of Expression).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const right = path.node.arguments[0] as any;
        // recast's printer will add parentheses as needed based on parent precedence
        path.replace(j.binaryExpression(operator as Parameters<typeof j.binaryExpression>[0], left, right));
      });
  }

  // ── Step 2 — Standalone BigNumber.from(x) → BigInt(x) ────────────────────
  // Any BigNumber.from() nodes that survive (weren't consumed by step 1) are
  // replaced now.

  if (hasBigNumberImport) {
    root
      .find(j.CallExpression, (node: CallExpression): boolean =>
        node.callee.type === 'MemberExpression' &&
        (node.callee as MemberExpression).object.type === 'Identifier' &&
        ((node.callee as MemberExpression).object as { name: string }).name === 'BigNumber' &&
        (node.callee as MemberExpression).property.type === 'Identifier' &&
        ((node.callee as MemberExpression).property as { name: string }).name === 'from'
      )
      .replaceWith((path: ASTPath<CallExpression>) =>
        j.callExpression(j.identifier('BigInt'), path.node.arguments)
      );
  }

  if (hasEthersNamespace) {
    root
      .find(j.CallExpression, (node: CallExpression): boolean => {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return false;
        const mem = callee as MemberExpression;
        if (
          mem.property.type !== 'Identifier' ||
          (mem.property as { name: string }).name !== 'from'
        ) return false;
        if (mem.object.type !== 'MemberExpression') return false;
        const inner = mem.object as MemberExpression;
        return (
          inner.object.type === 'Identifier' &&
          (inner.object as { name: string }).name === 'ethers' &&
          inner.property.type === 'Identifier' &&
          (inner.property as { name: string }).name === 'BigNumber'
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) =>
        j.callExpression(j.identifier('BigInt'), path.node.arguments)
      );
  }

  // ── Step 3 — Remove BigNumber from import specifiers ──────────────────────
  if (hasBigNumberImport) {
    ethersImports.forEach((path) => {
      const specifiers = path.node.specifiers ?? [];
      const filtered = specifiers.filter(
        (s) =>
          !(
            s.type === 'ImportSpecifier' &&
            s.imported.type === 'Identifier' &&
            (s.imported as { name: string }).name === 'BigNumber'
          )
      );
      if (filtered.length === 0) {
        j(path).remove();
      } else {
        path.node.specifiers = filtered;
      }
    });
  }

  return root.toSource({ quote: 'single' });
}
