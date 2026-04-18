import type {
  FileInfo,
  API,
  ASTPath,
  CallExpression,
  MemberExpression,
  ImportDeclaration,
} from 'jscodeshift';

const SEND_TX_TODO =
  ' TODO: ethers v6 - verify this is provider.sendTransaction (now broadcastTransaction) and not signer.sendTransaction (which stays the same in v6)';

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  let hasEthersNamespace = false;
  let hasParseTransactionImport = false;

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
        (spec.imported as { name: string }).name === 'parseTransaction'
      ) {
        hasParseTransactionImport = true;
      }
    }
  });

  // Helper: walk up to nearest Statement and prepend a TODO comment (idempotent)
  function addTodoComment(path: ASTPath<unknown>, marker: string, text: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: ASTPath<any> = path as ASTPath<any>;
    while (current.parent && !j.Statement.check(current.node)) {
      current = current.parent;
    }
    if (!j.Statement.check(current.node)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any[] = current.node.comments ?? [];
    if (existing.some((c: { value?: string }) => c.value?.includes(marker))) return;
    current.node.comments = [
      { type: 'CommentLine', value: text, leading: true, trailing: false },
      ...existing,
    ];
  }

  // ── a. sendTransaction → broadcastTransaction + TODO ────────────────────────
  // Both provider.sendTransaction and signer.sendTransaction match this pattern.
  // We cannot distinguish them statically, so we rename all of them and add a
  // TODO comment instructing the developer to verify which one it is.
  // signer.sendTransaction remains valid in v6 — if the TODO reveals a signer
  // call, the developer should revert the rename.

  root
    .find(j.CallExpression, (node: CallExpression): boolean => {
      const callee = node.callee;
      return (
        callee.type === 'MemberExpression' &&
        (callee as MemberExpression).property.type === 'Identifier' &&
        ((callee as MemberExpression).property as { name: string }).name === 'sendTransaction'
      );
    })
    .replaceWith((path: ASTPath<CallExpression>) => {
      addTodoComment(path, 'broadcastTransaction', SEND_TX_TODO);
      const callee = path.node.callee as MemberExpression;
      return j.callExpression(
        j.memberExpression(callee.object, j.identifier('broadcastTransaction')),
        path.node.arguments
      );
    });

  // ── b. ethers.utils.parseTransaction(x) → ethers.Transaction.from(x) ───────
  if (hasEthersNamespace) {
    root
      .find(j.CallExpression, (node: CallExpression): boolean => {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return false;
        const outer = callee as MemberExpression;
        if (outer.property.type !== 'Identifier') return false;
        if ((outer.property as { name: string }).name !== 'parseTransaction') return false;
        if (outer.object.type !== 'MemberExpression') return false;
        const inner = outer.object as MemberExpression;
        return (
          inner.object.type === 'Identifier' &&
          (inner.object as { name: string }).name === 'ethers' &&
          inner.property.type === 'Identifier' &&
          (inner.property as { name: string }).name === 'utils'
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) =>
        j.callExpression(
          j.memberExpression(
            j.memberExpression(j.identifier('ethers'), j.identifier('Transaction')),
            j.identifier('from')
          ),
          path.node.arguments
        )
      );
  }

  // ── b. bare parseTransaction(x) when imported from 'ethers' ─────────────────
  if (hasParseTransactionImport) {
    root
      .find(j.CallExpression, (node: CallExpression): boolean =>
        node.callee.type === 'Identifier' &&
        (node.callee as { name: string }).name === 'parseTransaction'
      )
      .replaceWith((path: ASTPath<CallExpression>) =>
        j.callExpression(
          j.memberExpression(j.identifier('Transaction'), j.identifier('from')),
          path.node.arguments
        )
      );

    // Replace parseTransaction import specifier with Transaction
    ethersImports.forEach((path) => {
      const specifiers = path.node.specifiers ?? [];
      const hasTransaction = specifiers.some(
        (s) =>
          s.type === 'ImportSpecifier' &&
          s.imported.type === 'Identifier' &&
          (s.imported as { name: string }).name === 'Transaction'
      );
      const filtered = specifiers.filter(
        (s) =>
          !(
            s.type === 'ImportSpecifier' &&
            s.imported.type === 'Identifier' &&
            (s.imported as { name: string }).name === 'parseTransaction'
          )
      );
      if (!hasTransaction) {
        filtered.push(j.importSpecifier(j.identifier('Transaction')));
      }
      path.node.specifiers = filtered;
    });
  }

  // ── c. ethers.utils.serializeTransaction(x) → ethers.Transaction.from(x).serialized
  if (hasEthersNamespace) {
    root
      .find(j.CallExpression, (node: CallExpression): boolean => {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return false;
        const outer = callee as MemberExpression;
        if (outer.property.type !== 'Identifier') return false;
        if ((outer.property as { name: string }).name !== 'serializeTransaction') return false;
        if (outer.object.type !== 'MemberExpression') return false;
        const inner = outer.object as MemberExpression;
        return (
          inner.object.type === 'Identifier' &&
          (inner.object as { name: string }).name === 'ethers' &&
          inner.property.type === 'Identifier' &&
          (inner.property as { name: string }).name === 'utils'
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) =>
        j.memberExpression(
          j.callExpression(
            j.memberExpression(
              j.memberExpression(j.identifier('ethers'), j.identifier('Transaction')),
              j.identifier('from')
            ),
            path.node.arguments
          ),
          j.identifier('serialized')
        )
      );
  }

  return root.toSource({ quote: 'single' });
}
