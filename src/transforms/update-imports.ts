import type { FileInfo, API, ImportDeclaration, ImportSpecifier } from 'jscodeshift';

// Specifier names that existed in ethers v5 but have no direct equivalent
// in v6 — the other transforms should have already rewritten all usages, so
// these can be safely dropped if they are still present.
const DEPRECATED_V5_NAMES = new Set(['utils', 'BigNumber', 'providers']);

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  root
    .find(j.ImportDeclaration, (node: ImportDeclaration): boolean =>
      node.source.value === 'ethers'
    )
    .forEach((path) => {
      const specifiers = path.node.specifiers ?? [];

      // Namespace / default imports (import * as ethers / import ethers) are
      // always kept — they are still valid in v6.
      const hasNamespaceOrDefault = specifiers.some(
        (s) =>
          s.type === 'ImportNamespaceSpecifier' ||
          s.type === 'ImportDefaultSpecifier'
      );
      if (hasNamespaceOrDefault) return;

      // For named-import declarations, strip specifiers whose names are
      // deprecated v5-only APIs.  Everything else — including `ethers`,
      // `Signer`, `Contract`, and any newly added v6 names — is kept.
      const filtered = specifiers.filter((spec): spec is ImportSpecifier => {
        if (spec.type !== 'ImportSpecifier') return true;
        const name = (spec.imported as { name: string }).name;
        return !DEPRECATED_V5_NAMES.has(name);
      });

      if (filtered.length === 0) {
        // Nothing valid left — remove the whole declaration.
        j(path).remove();
      } else if (filtered.length !== specifiers.length) {
        // At least one specifier was dropped — update in place.
        path.node.specifiers = filtered;
      }
      // If nothing changed, leave the node untouched so recast doesn't
      // re-format lines that didn't need to change.
    });

  return root.toSource({ quote: 'single' });
}
