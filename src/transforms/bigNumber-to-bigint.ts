import type {
  FileInfo,
  API,
  ASTPath,
  CallExpression,
  MemberExpression,
  Expression,
  ImportDeclaration,
} from 'jscodeshift';
import { bindsEthersNamespace } from './ethers-import';

// BigNumber instance methods that become binary operators.
// pow/shl/shr/div match native bigint exactly (checked against ethers@5.8.0).
// mod does not for a negative left side: v5 mod(-7, 3) is 2, -7n % 3n is -1.
const BN_ARITHMETIC_OPS: Record<string, string> = {
  add: '+',
  sub: '-',
  mul: '*',
  div: '/',
  mod: '%',
  pow: '**',
  shl: '<<',
  shr: '>>',
};
const BN_COMPARISON_OPS: Record<string, string> = {
  eq: '===',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};
const BN_BINARY_OPS: Record<string, string> = { ...BN_ARITHMETIC_OPS, ...BN_COMPARISON_OPS };
const BIGINT_BINARY_OPERATORS = new Set(Object.values(BN_ARITHMETIC_OPS));
// Zero-argument methods we rewrite on a known BigNumber
const BN_UNARY_METHODS = new Set(['toNumber', 'toHexString', 'isZero', 'isNegative', 'abs']);

const BN_SPECIFIC_METHODS = new Set(['toNumber', 'toHexString']);

// ethers.constants.* that were BigNumbers in v5 (checked against ethers 5.8.0)
const V5_NUMERIC_CONSTANTS = new Set([
  'MaxUint256', 'MinInt256', 'MaxInt256', 'WeiPerEther', 'Zero', 'One', 'Two', 'NegativeOne',
]);
// ...and the ones still exported by v6, now as bigint (checked against 6.17.0)
const V6_BIGINT_CONSTANTS = new Set(['MaxUint256', 'MinInt256', 'MaxInt256', 'WeiPerEther']);

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  // ── Detect import style ────────────────────────────────────────────────────
  let hasBigNumberImport = false; // import { BigNumber } from 'ethers'
  let hasEthersNamespace = false; // import * as ethers / import ethers from 'ethers'
  let ethersNamespaceIsNamedEthers = false; // the namespace/default local name is `ethers`
  let constantsLocal: string | null = null; // import { constants } from 'ethers'
  const v6ConstantLocals = new Set<string>(); // import { MaxUint256 } from 'ethers'

  const ethersImports = root.find(j.ImportDeclaration, (node: ImportDeclaration) =>
    node.source.value === 'ethers'
  );

  ethersImports.forEach((path) => {
    for (const spec of path.node.specifiers ?? []) {
      if (bindsEthersNamespace(spec)) {
        hasEthersNamespace = true;
        if ((spec.local?.name ?? 'ethers') === 'ethers') ethersNamespaceIsNamedEthers = true;
      } else if (
        spec.type === 'ImportSpecifier' &&
        spec.imported.type === 'Identifier' &&
        (spec.imported as { name: string }).name === 'BigNumber'
      ) {
        hasBigNumberImport = true;
      }
    }
  });

  ethersImports.forEach((path) => {
    for (const spec of path.node.specifiers ?? []) {
      if (spec.type !== 'ImportSpecifier' || spec.imported.type !== 'Identifier') continue;
      const imported = (spec.imported as { name: string }).name;
      const local = (spec.local as { name: string } | null)?.name ?? imported;
      if (imported === 'constants') constantsLocal = local;
      if (V6_BIGINT_CONSTANTS.has(imported)) v6ConstantLocals.add(local);
    }
  });

  if (!hasBigNumberImport && !hasEthersNamespace && !constantsLocal && v6ConstantLocals.size === 0) {
    return root.toSource({ quote: 'single' });
  }

  /** constants.MaxUint256, ethers.constants.MaxUint256, ethers.MaxUint256, MaxUint256 (from ethers) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isNumericConstant(node: any): boolean {
    if (node.type === 'Identifier') return v6ConstantLocals.has(node.name);
    if (node.type !== 'MemberExpression' || node.computed || node.property.type !== 'Identifier') return false;
    const prop = node.property.name;
    const obj = node.object;
    if (obj.type === 'Identifier') {
      if (constantsLocal && obj.name === constantsLocal) return V5_NUMERIC_CONSTANTS.has(prop);
      if (hasEthersNamespace && obj.name === 'ethers') return V6_BIGINT_CONSTANTS.has(prop);
      return false;
    }
    return (
      hasEthersNamespace &&
      obj.type === 'MemberExpression' && !obj.computed &&
      obj.object.type === 'Identifier' && obj.object.name === 'ethers' &&
      obj.property.type === 'Identifier' && obj.property.name === 'constants' &&
      V5_NUMERIC_CONSTANTS.has(prop)
    );
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
   * Variables definitively holding a BigNumber: assigned from BigNumber.from()
   * or from an arithmetic chain on a known BigNumber (e.g. from(2).pow(128)).
   * Conservative: only direct const/let/var declarations and simple assignments.
   * Repeated until nothing new is found, so `b = a.mul(2)` is tracked once `a` is.
   */
  const knownBigNumbers = new Set<string>();

  /** True for a BigNumber-valued expression, before or after conversion. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isKnownBigNumber(node: any): boolean {
    if (!node) return false;
    if (isBigNumberFromCall(node as Expression)) return true;
    if (isNumericConstant(node)) return true;
    if (node.type === 'Identifier') return knownBigNumbers.has(node.name);
    if (node.type === 'BigIntLiteral') return true;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'BigInt') {
      return true;
    }
    // already converted: a ** b, a - 1n, ...
    if (node.type === 'BinaryExpression' && BIGINT_BINARY_OPERATORS.has(node.operator)) {
      return isKnownBigNumber(node.left) || isKnownBigNumber(node.right);
    }
    // not yet converted: knownBN.pow(128), knownBN.sub(1), knownBN.abs()
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.type === 'Identifier' &&
      (node.callee.property.name in BN_ARITHMETIC_OPS || node.callee.property.name === 'abs')
    ) {
      return isKnownBigNumber(node.callee.object);
    }
    return false;
  }

  for (let changed = true; changed; ) {
    changed = false;
    root.find(j.VariableDeclarator).forEach((path) => {
      const { id, init } = path.node;
      if (id.type === 'Identifier' && init != null && !knownBigNumbers.has(id.name) && isKnownBigNumber(init)) {
        knownBigNumbers.add(id.name);
        changed = true;
      }
    });
    root.find(j.AssignmentExpression).forEach((path) => {
      const { left, right } = path.node;
      if (left.type === 'Identifier' && !knownBigNumbers.has(left.name) && isKnownBigNumber(right)) {
        knownBigNumbers.add(left.name);
        changed = true;
      }
    });
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
   * Make the right-hand operand of a migrated operator a bigint.
   * v5 methods accepted any BigNumberish; native operators throw on
   * bigint/number mixes (`a * 2`), compare false across types (`a === 1000`)
   * and concatenate strings (`a + '5'`).
   *  - integer literals become bigint literals: 2 → 2n, 0x10 → 0x10n
   *  - known bigints (tracked vars, BigNumber.from, BigInt(), 5n) are kept
   *  - anything else is wrapped: fee → BigInt(fee), '5' → BigInt('5')
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function toBigIntOperand(node: any): any {
    if (node.type === 'BigIntLiteral') return node;
    if (isKnownBigNumber(node as Expression)) return node;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'BigInt'
    ) return node;
    if (node.type === 'NumericLiteral') {
      const raw: string = node.extra?.raw ?? String(node.value);
      if (/^(0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+|[0-9]+)$/.test(raw.replace(/_/g, ''))) {
        return j.bigIntLiteral(raw);
      }
    }
    return j.callExpression(j.identifier('BigInt'), [node]);
  }

  /**
   * Walk up the path chain to find the nearest Statement node and prepend a
   * TODO line comment.  Idempotent — won't add twice.
   */
  function addTodoComment(
    path: ASTPath<unknown>,
    text = 'verify this BigNumber method call and migrate manually'
  ): void {
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
        value: ` TODO(ethers-codemod): ${text}`,
        leading: true,
        trailing: false,
      },
      ...existing,
    ];
  }

  // ── Step 1 — Transform method calls on confirmed BigNumbers ───────────────
  // Must run BEFORE the standalone BigNumber.from() → BigInt() pass so that
  // chained calls like `BigNumber.from(x).toNumber()` are handled atomically.
  //
  // Calls are processed innermost first, so in `from(2).pow(128).sub(1)` the
  // .pow() is converted to `BigInt(2) ** 128n` before .sub() looks at its
  // receiver, and the whole chain becomes `BigInt(2) ** 128n - 1n`.

  // .toHexString() → toBeHex(x)
  // v5 returns an even-length 0x-prefixed string ("0xff", "0x01"); v6 toBeHex()
  // matches it exactly, while bigint#toString(16) drops the prefix and padding.
  let needsToBeHexImport = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function toBeHexCall(arg: any): CallExpression {
    if (ethersNamespaceIsNamedEthers) {
      return j.callExpression(
        j.memberExpression(j.identifier('ethers'), j.identifier('toBeHex')),
        [arg]
      );
    }
    needsToBeHexImport = true;
    return j.callExpression(j.identifier('toBeHex'), [arg]);
  }

  type BinaryOperator = Parameters<typeof j.binaryExpression>[0];

  const methodCalls = root
    .find(j.CallExpression, (node: CallExpression): boolean => {
      if (node.callee.type !== 'MemberExpression') return false;
      const mem = node.callee as MemberExpression;
      if (mem.computed || mem.property.type !== 'Identifier') return false;
      const name = (mem.property as { name: string }).name;
      return (
        (name in BN_BINARY_OPS && node.arguments.length === 1) ||
        (BN_UNARY_METHODS.has(name) && node.arguments.length === 0)
      );
    })
    .paths()
    .reverse(); // innermost first

  for (const path of methodCalls) {
    const callee = path.node.callee as MemberExpression;
    const method = (callee.property as { name: string }).name;
    const obj = callee.object as Expression;

    if (!isKnownBigNumber(obj)) {
      // .add/.sub etc. are too generic to add a TODO; these two are BigNumber-specific
      if (BN_SPECIFIC_METHODS.has(method)) addTodoComment(path);
      continue;
    }
    const left = resolveReceiver(obj);

    if (method === 'toNumber') {
      path.replace(j.callExpression(j.identifier('Number'), [left]));
    } else if (method === 'toHexString') {
      path.replace(toBeHexCall(left));
    } else if (method === 'isZero') {
      path.replace(j.binaryExpression('===', left, j.bigIntLiteral('0')));
    } else if (method === 'isNegative') {
      path.replace(j.binaryExpression('<', left, j.bigIntLiteral('0')));
    } else if (method === 'abs') {
      // Needs the value twice, so only rewrite when that is free of side effects.
      if (left.type === 'Identifier') {
        path.replace(
          j.conditionalExpression(
            j.binaryExpression('<', left, j.bigIntLiteral('0')),
            j.unaryExpression('-', j.identifier(left.name)),
            j.identifier(left.name)
          )
        );
      } else {
        addTodoComment(path, '.abs() on an expression: store it in a variable v, then use (v < 0n ? -v : v)');
      }
    } else {
      // Cast through any: jscodeshift's Expression and ast-types' ExpressionKind
      // are structurally incompatible in newer @types/jscodeshift.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const right = toBigIntOperand(path.node.arguments[0] as any);
      // recast's printer adds parentheses as needed based on precedence
      path.replace(j.binaryExpression(BN_BINARY_OPS[method] as BinaryOperator, left, right));
      if (method === 'mod') {
        addTodoComment(
          path,
          'v5 .mod() never returned a negative number; % keeps the sign of the left side. ' +
            'If it can be negative, use ((a % b) + b) % b'
        );
      }
    }
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

  // ── Step 2b — Other BigNumber references ────────────────────────────────
  // Without this, removing the import leaves `: BigNumber` annotations and
  // calls like BigNumber.isBigNumber() pointing at a name that no longer exists.

  /** `BigNumber` (named import) or `ethers.BigNumber` (namespace) as an expression. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isBigNumberRef(node: any): boolean {
    if (hasBigNumberImport && node.type === 'Identifier' && node.name === 'BigNumber') return true;
    return (
      hasEthersNamespace &&
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.object.type === 'Identifier' &&
      node.object.name === 'ethers' &&
      node.property.type === 'Identifier' &&
      node.property.name === 'BigNumber'
    );
  }

  // Types: BigNumber / ethers.BigNumber → bigint
  root.find(j.TSTypeReference).forEach((path) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name: any = path.node.typeName;
    const isNamed = hasBigNumberImport && name.type === 'Identifier' && name.name === 'BigNumber';
    const isQualified =
      hasEthersNamespace &&
      name.type === 'TSQualifiedName' &&
      name.left.type === 'Identifier' &&
      name.left.name === 'ethers' &&
      name.right.name === 'BigNumber';
    if ((isNamed || isQualified) && !path.node.typeParameters) {
      // Rename in place rather than replacing the node with a keyword node:
      // replacing it makes recast reprint an enclosing function type as
      // `() : bigint`, which is a syntax error. The printed text is the same.
      path.node.typeName = j.identifier('bigint');
    }
  });

  // BigNumber.isBigNumber(x) → typeof x === 'bigint'
  root
    .find(j.CallExpression, (node: CallExpression): boolean => {
      const callee = node.callee as MemberExpression;
      return (
        callee.type === 'MemberExpression' &&
        isBigNumberRef(callee.object) &&
        callee.property.type === 'Identifier' &&
        (callee.property as { name: string }).name === 'isBigNumber' &&
        node.arguments.length === 1
      );
    })
    .replaceWith((path: ASTPath<CallExpression>) =>
      j.binaryExpression(
        '===',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        j.unaryExpression('typeof', path.node.arguments[0] as any),
        j.stringLiteral('bigint')
      )
    );

  // BigNumber.from passed as a function (e.g. values.map(BigNumber.from)) → BigInt
  root
    .find(j.MemberExpression, (node: MemberExpression): boolean =>
      isBigNumberRef(node.object) &&
      node.property.type === 'Identifier' &&
      (node.property as { name: string }).name === 'from'
    )
    .filter((path) => !(path.parent.node.type === 'CallExpression' && path.parent.node.callee === path.node))
    .replaceWith(() => j.identifier('BigInt'));

  // Anything left (BigNumber.fromTwos(...), instanceof BigNumber, ...) can't be
  // mapped mechanically: flag it rather than leave a dangling name silently.
  root
    .find(j.Identifier, { name: 'BigNumber' })
    .filter((path) => {
      const parent = path.parent.node;
      if (parent.type === 'ImportSpecifier') return false;
      // ethers.BigNumber is caught via its MemberExpression parent's object check below
      if (parent.type === 'MemberExpression' && parent.property === path.node && !parent.computed) {
        return isBigNumberRef(parent);
      }
      return hasBigNumberImport && parent.type !== 'TSQualifiedName';
    })
    .forEach((path) => addTodoComment(path, 'BigNumber no longer exists in ethers v6; replace this with bigint logic'));

  // ── Step 3 — Remove BigNumber from import specifiers ──────────────────────
  // (and add `toBeHex` to the first named ethers import if Step 1 used it)
  if (hasBigNumberImport) {
    let toBeHexAdded = false;
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
      const isNamedImport = specifiers.some((s) => s.type === 'ImportSpecifier');
      const alreadyHasToBeHex = filtered.some(
        (s) =>
          s.type === 'ImportSpecifier' &&
          s.imported.type === 'Identifier' &&
          (s.imported as { name: string }).name === 'toBeHex'
      );
      if (needsToBeHexImport && !toBeHexAdded && isNamedImport) {
        if (!alreadyHasToBeHex) filtered.push(j.importSpecifier(j.identifier('toBeHex')));
        toBeHexAdded = true;
      }
      if (filtered.length === 0) {
        j(path).remove();
      } else {
        path.node.specifiers = filtered;
      }
    });
  }

  return root.toSource({ quote: 'single' });
}
