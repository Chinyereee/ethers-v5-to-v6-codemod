/**
 * True when an import specifier from 'ethers' makes the identifier `ethers`
 * refer to the whole library, so `ethers.utils.*`, `ethers.providers.*` and
 * friends can be rewritten:
 *
 *   import * as ethers from 'ethers';   // namespace
 *   import ethers from 'ethers';        // default
 *   import { ethers } from 'ethers';    // named (the style the v5 docs use)
 *
 * An aliased `import { ethers as e }` does not count: the transforms only
 * rewrite member expressions rooted at the identifier `ethers`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bindsEthersNamespace(spec: any): boolean {
  if (spec.type === 'ImportNamespaceSpecifier' || spec.type === 'ImportDefaultSpecifier') {
    return true;
  }
  return (
    spec.type === 'ImportSpecifier' &&
    spec.imported?.type === 'Identifier' &&
    spec.imported.name === 'ethers' &&
    (spec.local == null || spec.local.name === 'ethers')
  );
}
