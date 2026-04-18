import type {
  FileInfo,
  API,
  MemberExpression,
  ImportDeclaration,
} from 'jscodeshift';

// ethers.constants.X → ethers.Y (simple property renames)
const CONSTANTS_TO_ETHERS: Record<string, string> = {
  AddressZero: 'ZeroAddress',
  HashZero: 'ZeroHash',
  MaxUint256: 'MaxUint256',
  MinInt256: 'MinInt256',
  WeiPerEther: 'WeiPerEther',
  EtherSymbol: 'EtherSymbol',
};

// ethers.constants.X → bigint literal (numeric constants removed in v6)
const CONSTANTS_TO_BIGINT: Record<string, string> = {
  NegativeOne: '-1n',
  Zero: '0n',
  One: '1n',
  Two: '2n',
};

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  let hasEthersNamespace = false;
  let hasConstantsDestructured = false;

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
        (spec.imported as { name: string }).name === 'constants'
      ) {
        hasConstantsDestructured = true;
      }
    }
  });

  if (!hasEthersNamespace && !hasConstantsDestructured) {
    return root.toSource({ quote: 'single' });
  }

  // Helper: true when a MemberExpression is `<ns>.constants.<name>`
  function isConstantsAccess(node: MemberExpression, ns: string, constName: string): boolean {
    if (node.property.type !== 'Identifier') return false;
    if ((node.property as { name: string }).name !== constName) return false;
    if (node.object.type !== 'MemberExpression') return false;
    const inner = node.object as MemberExpression;
    return (
      inner.object.type === 'Identifier' &&
      (inner.object as { name: string }).name === ns &&
      inner.property.type === 'Identifier' &&
      (inner.property as { name: string }).name === 'constants'
    );
  }

  // Helper: true when a MemberExpression is `constants.<name>` (destructured)
  function isDestructuredConstantsAccess(node: MemberExpression, constName: string): boolean {
    return (
      node.object.type === 'Identifier' &&
      (node.object as { name: string }).name === 'constants' &&
      node.property.type === 'Identifier' &&
      (node.property as { name: string }).name === constName
    );
  }

  // ── 1. Namespace: ethers.constants.X ────────────────────────────────────────
  if (hasEthersNamespace) {
    // Simple renames: ethers.constants.X → ethers.Y
    for (const [v5Name, v6Name] of Object.entries(CONSTANTS_TO_ETHERS)) {
      root
        .find(j.MemberExpression, (node: MemberExpression) =>
          isConstantsAccess(node, 'ethers', v5Name)
        )
        .replaceWith(() =>
          j.memberExpression(j.identifier('ethers'), j.identifier(v6Name))
        );
    }

    // Numeric constants: ethers.constants.X → bigint literal
    for (const [v5Name, literal] of Object.entries(CONSTANTS_TO_BIGINT)) {
      root
        .find(j.MemberExpression, (node: MemberExpression) =>
          isConstantsAccess(node, 'ethers', v5Name)
        )
        .replaceWith(() => {
          // Build a BigInt literal: negative uses UnaryExpression(-), others NumericLiteral
          if (literal.startsWith('-')) {
            return j.unaryExpression('-', j.bigIntLiteral('1'));
          }
          const value = literal.replace('n', '');
          return j.bigIntLiteral(value);
        });
    }
  }

  // ── 2. Destructured: constants.X ────────────────────────────────────────────
  if (hasConstantsDestructured) {
    let didTransform = false;
    const usedV6Names = new Set<string>();

    // Simple renames: constants.X → ethers.Y
    for (const [v5Name, v6Name] of Object.entries(CONSTANTS_TO_ETHERS)) {
      root
        .find(j.MemberExpression, (node: MemberExpression) =>
          isDestructuredConstantsAccess(node, v5Name)
        )
        .replaceWith(() => {
          didTransform = true;
          usedV6Names.add(v6Name);
          return j.memberExpression(j.identifier('ethers'), j.identifier(v6Name));
        });
    }

    // Numeric constants: constants.X → bigint literal
    for (const [v5Name, literal] of Object.entries(CONSTANTS_TO_BIGINT)) {
      root
        .find(j.MemberExpression, (node: MemberExpression) =>
          isDestructuredConstantsAccess(node, v5Name)
        )
        .replaceWith(() => {
          didTransform = true;
          if (literal.startsWith('-')) {
            return j.unaryExpression('-', j.bigIntLiteral('1'));
          }
          const value = literal.replace('n', '');
          return j.bigIntLiteral(value);
        });
    }

    if (didTransform) {
      ethersImports.forEach((path) => {
        const specifiers = path.node.specifiers ?? [];

        // Drop `constants`
        const filtered = specifiers.filter(
          (s) =>
            !(
              s.type === 'ImportSpecifier' &&
              s.imported.type === 'Identifier' &&
              (s.imported as { name: string }).name === 'constants'
            )
        );

        // Add new v6 named specifiers that aren't numeric literals and not yet imported
        const existingNames = new Set(
          filtered
            .filter((s) => s.type === 'ImportSpecifier')
            .map((s) => (s as { imported: { name: string } }).imported.name)
        );

        for (const name of [...usedV6Names].sort()) {
          if (!existingNames.has(name)) {
            filtered.push(j.importSpecifier(j.identifier(name)));
          }
        }

        // If numeric-only replacements leave an empty import, remove it
        if (filtered.length === 0) {
          j(path).remove();
        } else {
          path.node.specifiers = filtered;
        }
      });
    }
  }

  return root.toSource({ quote: 'single' });
}
