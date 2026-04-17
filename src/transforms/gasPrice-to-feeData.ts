import type {
  FileInfo,
  API,
  ASTPath,
  CallExpression,
  MemberExpression,
  AwaitExpression,
  TSTypeReference,
} from 'jscodeshift';

const TODO_COMMENT =
  ' TODO: ethers v6 - replace getGasPrice() with getFeeData() and access .gasPrice, .maxFeePerGas, or .maxPriorityFeePerGas';

// ── Type helpers ─────────────────────────────────────────────────────────────

type TSIdentifier = { type: 'Identifier'; name: string };
type QualifiedName = {
  type: 'TSQualifiedName';
  left: TSIdentifier | QualifiedName;
  right: TSIdentifier;
};

/** True when typeName is `A.B.C` where A=outerIdent, B=innerIdent, C=leaf. */
function isThreePart(
  typeName: unknown,
  outerIdent: string,
  innerIdent: string,
  leaf: string
): typeName is QualifiedName {
  const qn = typeName as QualifiedName;
  if (qn?.type !== 'TSQualifiedName') return false;
  if (qn.right?.type !== 'Identifier' || qn.right.name !== leaf) return false;
  const left = qn.left as QualifiedName;
  return (
    left?.type === 'TSQualifiedName' &&
    left.left?.type === 'Identifier' &&
    (left.left as TSIdentifier).name === outerIdent &&
    left.right?.type === 'Identifier' &&
    (left.right as TSIdentifier).name === innerIdent
  );
}

// ── Transform ─────────────────────────────────────────────────────────────────

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * True for any no-argument `.getGasPrice()` method call.
   * `getGasPrice` is ethers-specific enough that this is safe without checking
   * the receiver's identity.
   */
  function isGetGasPriceCall(node: CallExpression): boolean {
    const callee = node.callee;
    return (
      callee.type === 'MemberExpression' &&
      (callee as MemberExpression).property.type === 'Identifier' &&
      ((callee as MemberExpression).property as { name: string }).name === 'getGasPrice' &&
      node.arguments.length === 0
    );
  }

  /**
   * Build `(await <receiver>.getFeeData()).gasPrice`.
   *
   * Recast automatically wraps the AwaitExpression in parentheses here
   * because AwaitExpression has lower operator precedence than MemberExpression.
   */
  function buildFeeDataAccess(originalCallee: MemberExpression): MemberExpression {
    const getFeeDataCall = j.callExpression(
      j.memberExpression(originalCallee.object, j.identifier('getFeeData')),
      []
    );
    return j.memberExpression(
      j.awaitExpression(getFeeDataCall),
      j.identifier('gasPrice')
    );
  }

  /**
   * Prepend a TODO line comment to the nearest enclosing Statement.
   * Idempotent — will not add a second comment if one already mentions getGasPrice.
   */
  function addTodoComment(path: ASTPath<unknown>): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: ASTPath<any> = path as ASTPath<any>;
    while (current.parent && !j.Statement.check(current.node)) {
      current = current.parent;
    }
    if (!j.Statement.check(current.node)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any[] = current.node.comments ?? [];
    if (existing.some((c: { value?: string }) => c.value?.includes('getGasPrice'))) return;

    current.node.comments = [
      { type: 'CommentLine', value: TODO_COMMENT, leading: true, trailing: false },
      ...existing,
    ];
  }

  // ── Step 1: `await <x>.getGasPrice()` → `(await <x>.getFeeData()).gasPrice` ─
  //
  // We replace the entire AwaitExpression, so the result slots naturally into
  // any context: variable declaration, object property, expression statement, etc.
  // e.g.
  //   const gas = await provider.getGasPrice()
  //     → const gas = (await provider.getFeeData()).gasPrice
  //   { gasPrice: await provider.getGasPrice() }
  //     → { gasPrice: (await provider.getFeeData()).gasPrice }

  root
    .find(j.AwaitExpression, (node: AwaitExpression): boolean =>
      // node.argument can be null for bare `await` — guard before accessing
      node.argument != null &&
      node.argument.type === 'CallExpression' &&
      isGetGasPriceCall(node.argument as CallExpression)
    )
    .replaceWith((path: ASTPath<AwaitExpression>) => {
      const call = path.node.argument as CallExpression;
      return buildFeeDataAccess(call.callee as MemberExpression);
    });

  // ── Step 2: non-awaited `.getGasPrice()` → TODO comment ──────────────────
  //
  // Non-awaited usage is ambiguous (might be a Promise pipeline, might be
  // .then(), might be a fire-and-forget).  Leave the code untouched but flag it.

  root
    .find(j.CallExpression, (node: CallExpression): boolean =>
      isGetGasPriceCall(node)
    )
    .forEach((path: ASTPath<CallExpression>) => {
      // After step 1, no getGasPrice() call should still be wrapped in an
      // AwaitExpression — but guard defensively to avoid double-annotating.
      if (path.parent?.node.type === 'AwaitExpression') return;
      addTodoComment(path);
    });

  // ── Step 3: `ethers.providers.FeeData` type → `ethers.FeeData` ───────────

  root
    .find(j.TSTypeReference, (node: TSTypeReference): boolean =>
      isThreePart(node.typeName, 'ethers', 'providers', 'FeeData')
    )
    .replaceWith((path: ASTPath<TSTypeReference>) =>
      j.tsTypeReference(
        j.tsQualifiedName(j.identifier('ethers'), j.identifier('FeeData')),
        path.node.typeParameters ?? null
      )
    );

  return root.toSource({ quote: 'single' });
}
