import type {
  FileInfo,
  API,
  ASTPath,
  CallExpression,
  MemberExpression,
  ImportDeclaration,
} from 'jscodeshift';
import { bindsEthersNamespace } from './ethers-import';

// Maps ethers.utils.X -> ethers.Y (simple renames)
export const UTILS_TO_ETHERS: Record<string, string> = {
  parseEther: 'parseEther',
  formatEther: 'formatEther',
  parseUnits: 'parseUnits',
  formatUnits: 'formatUnits',
  keccak256: 'keccak256',
  sha256: 'sha256',
  toUtf8Bytes: 'toUtf8Bytes',
  toUtf8String: 'toUtf8String',
  hexlify: 'hexlify',
  isAddress: 'isAddress',
  getAddress: 'getAddress',
  id: 'id',
  // renames
  arrayify: 'getBytes',
  hexZeroPad: 'zeroPadValue',
  zeroPad: 'zeroPadBytes',
  // bytes32 string helpers
  formatBytes32String: 'encodeBytes32String',
  parseBytes32String: 'decodeBytes32String',
  // data manipulation
  hexDataSlice: 'dataSlice',
  hexValue: 'toQuantity',
  // solidity non-standard packed
  solidityPack: 'solidityPacked',
  solidityKeccak256: 'solidityPackedKeccak256',
  soliditySha256: 'solidityPackedSha256',
};

// Special: utils.splitSignature(x) -> ethers.Signature.from(x)
const SPLIT_SIGNATURE = 'splitSignature';
// Special: utils.joinSignature(x) -> ethers.Signature.from(x).serialized
const JOIN_SIGNATURE = 'joinSignature';
// Special: ethers.utils.defaultAbiCoder -> ethers.AbiCoder.defaultAbiCoder()
const DEFAULT_ABI_CODER = 'defaultAbiCoder';

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  // --- Detect ethers import style ---
  // Track whether `ethers` is imported as a namespace or specifier
  let hasEthersNamespace = false; // import * as ethers / import ethers
  let hasUtilsDestructured = false; // import { utils } from 'ethers'
  let hasEthersSpecifier = false;   // import { ethers } from 'ethers' (the v5 docs style)

  const ethersImports = root.find(j.ImportDeclaration, (node: ImportDeclaration) =>
    node.source.value === 'ethers'
  );

  ethersImports.forEach((path) => {
    const specifiers = path.node.specifiers ?? [];
    for (const spec of specifiers) {
      if (spec.type === 'ImportNamespaceSpecifier') {
        // import * as ethers from 'ethers'
        hasEthersNamespace = true;
      } else if (spec.type === 'ImportDefaultSpecifier') {
        // import ethers from 'ethers'
        hasEthersNamespace = true;
      } else if (spec.type === 'ImportSpecifier') {
        if (spec.imported.type === 'Identifier' && spec.imported.name === 'utils') {
          hasUtilsDestructured = true;
        }
        if (spec.imported.type === 'Identifier' && spec.imported.name === 'ethers') {
          hasEthersSpecifier = true;
          // import { ethers } from 'ethers' binds the whole library, like a namespace import
          if (bindsEthersNamespace(spec)) hasEthersNamespace = true;
        }
      }
    }
  });

  // Helper: build ethers.X member expression
  const ethersAccess = (name: string) =>
    j.memberExpression(j.identifier('ethers'), j.identifier(name));

  // Helper: build ethers.Namespace.method() call
  const ethersNamespacedCall = (ns: string, method: string, args: CallExpression['arguments']) =>
    j.callExpression(
      j.memberExpression(
        j.memberExpression(j.identifier('ethers'), j.identifier(ns)),
        j.identifier(method)
      ),
      args
    );

  // --- 1. Transform ethers.utils.X(...) ---
  if (hasEthersNamespace) {
    // Handle ethers.utils.defaultAbiCoder (property access, not call)
    root
      .find(j.MemberExpression, (node: MemberExpression) => {
        return (
          node.object.type === 'MemberExpression' &&
          (node.object as MemberExpression).object.type === 'Identifier' &&
          ((node.object as MemberExpression).object as { name: string }).name === 'ethers' &&
          (node.object as MemberExpression).property.type === 'Identifier' &&
          ((node.object as MemberExpression).property as { name: string }).name === 'utils' &&
          node.property.type === 'Identifier' &&
          (node.property as { name: string }).name === DEFAULT_ABI_CODER
        );
      })
      // Only replace when NOT already part of a larger ethers.utils.defaultAbiCoder.X chain
      // that we're already handling as a call — replace standalone member accesses
      .filter((path) => {
        // Skip if parent is a MemberExpression where this is the object
        // i.e. ethers.utils.defaultAbiCoder.encode(...) — we just replace the base
        return true; // replace in all positions; the call-site replacement covers the rest
      })
      .replaceWith(() =>
        j.callExpression(
          j.memberExpression(
            j.memberExpression(j.identifier('ethers'), j.identifier('AbiCoder')),
            j.identifier('defaultAbiCoder')
          ),
          []
        )
      );

    // Handle ethers.utils.splitSignature(x) -> ethers.Signature.from(x)
    root
      .find(j.CallExpression, (node: CallExpression) => {
        const callee = node.callee;
        return (
          callee.type === 'MemberExpression' &&
          (callee as MemberExpression).object.type === 'MemberExpression' &&
          ((callee as MemberExpression).object as MemberExpression).object.type === 'Identifier' &&
          (((callee as MemberExpression).object as MemberExpression).object as { name: string }).name === 'ethers' &&
          ((callee as MemberExpression).object as MemberExpression).property.type === 'Identifier' &&
          (((callee as MemberExpression).object as MemberExpression).property as { name: string }).name === 'utils' &&
          (callee as MemberExpression).property.type === 'Identifier' &&
          ((callee as MemberExpression).property as { name: string }).name === SPLIT_SIGNATURE
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) =>
        ethersNamespacedCall('Signature', 'from', path.node.arguments)
      );

    // Handle ethers.utils.joinSignature(x) -> ethers.Signature.from(x).serialized
    root
      .find(j.CallExpression, (node: CallExpression) => {
        const callee = node.callee;
        return (
          callee.type === 'MemberExpression' &&
          (callee as MemberExpression).object.type === 'MemberExpression' &&
          ((callee as MemberExpression).object as MemberExpression).object.type === 'Identifier' &&
          (((callee as MemberExpression).object as MemberExpression).object as { name: string }).name === 'ethers' &&
          ((callee as MemberExpression).object as MemberExpression).property.type === 'Identifier' &&
          (((callee as MemberExpression).object as MemberExpression).property as { name: string }).name === 'utils' &&
          (callee as MemberExpression).property.type === 'Identifier' &&
          ((callee as MemberExpression).property as { name: string }).name === JOIN_SIGNATURE
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) =>
        j.memberExpression(
          ethersNamespacedCall('Signature', 'from', path.node.arguments),
          j.identifier('serialized')
        )
      );

    // Handle all other ethers.utils.X(...) -> ethers.Y(...)
    root
      .find(j.CallExpression, (node: CallExpression) => {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return false;
        const obj = (callee as MemberExpression).object;
        const prop = (callee as MemberExpression).property;
        if (obj.type !== 'MemberExpression') return false;
        const outerObj = (obj as MemberExpression).object;
        const outerProp = (obj as MemberExpression).property;
        return (
          outerObj.type === 'Identifier' &&
          (outerObj as { name: string }).name === 'ethers' &&
          outerProp.type === 'Identifier' &&
          (outerProp as { name: string }).name === 'utils' &&
          prop.type === 'Identifier' &&
          (prop as { name: string }).name in UTILS_TO_ETHERS
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) => {
        const callee = path.node.callee as MemberExpression;
        const methodName = (callee.property as { name: string }).name;
        const v6Name = UTILS_TO_ETHERS[methodName];
        return j.callExpression(ethersAccess(v6Name), path.node.arguments);
      });
  }

  // --- 2. Transform utils.X(...) from destructured import ---
  if (hasUtilsDestructured) {
    let didTransform = false;

    // If `ethers` is already declared by something else (e.g. hardhat's
    // `import { ethers } from 'hardhat'`), adding `import { ethers } from
    // 'ethers'` would declare it twice. Import the flattened names instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const declaresEthers = (id: any): boolean =>
      (id?.type === 'Identifier' && id.name === 'ethers') ||
      (id?.type === 'ObjectPattern' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id.properties.some((p: any) => declaresEthers(p.value ?? p.argument)));
    const ethersBoundElsewhere =
      root
        .find(j.ImportDeclaration, (n: ImportDeclaration) => n.source.value !== 'ethers')
        .filter((p) => (p.node.specifiers ?? []).some((s) => s.local?.name === 'ethers'))
        .size() > 0 ||
      root.find(j.VariableDeclarator).filter((p) => declaresEthers(p.node.id)).size() > 0;
    const bare = !hasEthersNamespace && !hasEthersSpecifier && ethersBoundElsewhere;
    const bareNames = new Set<string>();
    const access = (name: string) => {
      if (!bare) return ethersAccess(name);
      bareNames.add(name);
      return j.identifier(name);
    };
    const nsCall = (ns: string, method: string, args: CallExpression['arguments']) => {
      if (!bare) return ethersNamespacedCall(ns, method, args);
      bareNames.add(ns);
      return j.callExpression(j.memberExpression(j.identifier(ns), j.identifier(method)), args);
    };

    // utils.defaultAbiCoder -> ethers.AbiCoder.defaultAbiCoder()
    root
      .find(j.MemberExpression, (node: MemberExpression) => {
        return (
          node.object.type === 'Identifier' &&
          (node.object as { name: string }).name === 'utils' &&
          node.property.type === 'Identifier' &&
          (node.property as { name: string }).name === DEFAULT_ABI_CODER
        );
      })
      .replaceWith(() => {
        didTransform = true;
        return nsCall('AbiCoder', 'defaultAbiCoder', []);
      });

    // utils.splitSignature(x) -> ethers.Signature.from(x)
    root
      .find(j.CallExpression, (node: CallExpression) => {
        const callee = node.callee;
        return (
          callee.type === 'MemberExpression' &&
          (callee as MemberExpression).object.type === 'Identifier' &&
          ((callee as MemberExpression).object as { name: string }).name === 'utils' &&
          (callee as MemberExpression).property.type === 'Identifier' &&
          ((callee as MemberExpression).property as { name: string }).name === SPLIT_SIGNATURE
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) => {
        didTransform = true;
        return nsCall('Signature', 'from', path.node.arguments);
      });

    // utils.joinSignature(x) -> ethers.Signature.from(x).serialized
    root
      .find(j.CallExpression, (node: CallExpression) => {
        const callee = node.callee;
        return (
          callee.type === 'MemberExpression' &&
          (callee as MemberExpression).object.type === 'Identifier' &&
          ((callee as MemberExpression).object as { name: string }).name === 'utils' &&
          (callee as MemberExpression).property.type === 'Identifier' &&
          ((callee as MemberExpression).property as { name: string }).name === JOIN_SIGNATURE
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) => {
        didTransform = true;
        return j.memberExpression(
          nsCall('Signature', 'from', path.node.arguments),
          j.identifier('serialized')
        );
      });

    // utils.X(...) -> ethers.Y(...)
    root
      .find(j.CallExpression, (node: CallExpression) => {
        const callee = node.callee;
        return (
          callee.type === 'MemberExpression' &&
          (callee as MemberExpression).object.type === 'Identifier' &&
          ((callee as MemberExpression).object as { name: string }).name === 'utils' &&
          (callee as MemberExpression).property.type === 'Identifier' &&
          ((callee as MemberExpression).property as { name: string }).name in UTILS_TO_ETHERS
        );
      })
      .replaceWith((path: ASTPath<CallExpression>) => {
        didTransform = true;
        const callee = path.node.callee as MemberExpression;
        const methodName = (callee.property as { name: string }).name;
        const v6Name = UTILS_TO_ETHERS[methodName];
        return j.callExpression(access(v6Name), path.node.arguments);
      });

    if (didTransform) {
      // Remove `utils` from the ethers import specifiers
      ethersImports.forEach((path) => {
        const specifiers = path.node.specifiers ?? [];
        const filtered = specifiers.filter(
          (s) =>
            !(
              s.type === 'ImportSpecifier' &&
              s.imported.type === 'Identifier' &&
              s.imported.name === 'utils'
            )
        );

        // Add `ethers` specifier if not already present and no namespace import
        const alreadyHasEthers =
          hasEthersNamespace ||
          hasEthersSpecifier ||
          filtered.some(
            (s) =>
              s.type === 'ImportSpecifier' &&
              s.imported.type === 'Identifier' &&
              (s.imported as { name: string }).name === 'ethers'
          );

        if (bare) {
          const have = new Set(
            filtered
              .filter((s) => s.type === 'ImportSpecifier')
              .map((s) => (s as { imported: { name: string } }).imported.name)
          );
          for (const name of [...bareNames].sort()) {
            if (!have.has(name)) filtered.push(j.importSpecifier(j.identifier(name)));
          }
        } else if (!alreadyHasEthers) {
          filtered.unshift(j.importSpecifier(j.identifier('ethers')));
        }

        if (filtered.length === 0) {
          // Nothing left to import — remove the declaration entirely
          j(path).remove();
        } else {
          path.node.specifiers = filtered;
        }
      });
    }
  }

  return root.toSource({ quote: 'single' });
}
