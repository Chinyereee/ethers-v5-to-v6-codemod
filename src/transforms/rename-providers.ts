import type {
  FileInfo,
  API,
  ASTPath,
  NewExpression,
  MemberExpression,
  ImportDeclaration,
  TSTypeReference,
} from 'jscodeshift';

// v5 providers.X → v6 ethers.Y  (StaticJsonRpcProvider merged into JsonRpcProvider)
const PROVIDER_MAP: Record<string, string> = {
  Web3Provider: 'BrowserProvider',
  JsonRpcProvider: 'JsonRpcProvider',
  WebSocketProvider: 'WebSocketProvider',
  FallbackProvider: 'FallbackProvider',
  StaticJsonRpcProvider: 'JsonRpcProvider',
  AlchemyProvider: 'AlchemyProvider',
  InfuraProvider: 'InfuraProvider',
};

// ── AST shape helpers ────────────────────────────────────────────────────────

type QualifiedName = {
  type: 'TSQualifiedName';
  left: { type: string; name?: string } | QualifiedName;
  right: { type: string; name: string };
};

/** Return the rightmost `Identifier` name from a TSQualifiedName chain. */
function rightName(qn: QualifiedName): string {
  return qn.right.name;
}

/**
 * True when typeName represents `A.B` — i.e. a one-level qualified name
 * where the left side is a plain Identifier.
 */
function isQN1(
  typeName: unknown,
  leftIdent: string
): typeName is QualifiedName {
  const qn = typeName as QualifiedName;
  return (
    qn?.type === 'TSQualifiedName' &&
    qn.left?.type === 'Identifier' &&
    (qn.left as { name: string }).name === leftIdent &&
    qn.right?.type === 'Identifier' &&
    qn.right.name in PROVIDER_MAP
  );
}

/**
 * True when typeName represents `A.B.C` — i.e. a two-level qualified name
 * like `ethers.providers.Web3Provider`.
 */
function isQN2(
  typeName: unknown,
  outerIdent: string,
  innerIdent: string
): typeName is QualifiedName {
  const qn = typeName as QualifiedName;
  if (qn?.type !== 'TSQualifiedName') return false;
  if (qn.right?.type !== 'Identifier') return false;
  if (!(qn.right.name in PROVIDER_MAP)) return false;
  const left = qn.left as QualifiedName;
  return (
    left?.type === 'TSQualifiedName' &&
    left.left?.type === 'Identifier' &&
    (left.left as { name: string }).name === outerIdent &&
    left.right?.type === 'Identifier' &&
    (left.right as { name: string }).name === innerIdent
  );
}

/** True when `new X.Y.Z(...)` callee matches `ns.providers.ProviderName`. */
function isNamespacedNew(callee: MemberExpression, ns: string): boolean {
  if (callee.property.type !== 'Identifier') return false;
  if (!((callee.property as { name: string }).name in PROVIDER_MAP)) return false;
  if (callee.object.type !== 'MemberExpression') return false;
  const inner = callee.object as MemberExpression;
  return (
    inner.object.type === 'Identifier' &&
    (inner.object as { name: string }).name === ns &&
    inner.property.type === 'Identifier' &&
    (inner.property as { name: string }).name === 'providers'
  );
}

/** True when `new X.Y(...)` callee matches `providers.ProviderName`. */
function isDestructuredNew(callee: MemberExpression): boolean {
  return (
    callee.object.type === 'Identifier' &&
    (callee.object as { name: string }).name === 'providers' &&
    callee.property.type === 'Identifier' &&
    (callee.property as { name: string }).name in PROVIDER_MAP
  );
}

// ── Transform ────────────────────────────────────────────────────────────────

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  // ── Detect import style ──────────────────────────────────────────────────
  let hasEthersNamespace = false;      // import * as ethers / import ethers
  let hasProvidersDestructured = false; // import { providers } from 'ethers'

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
        (spec.imported as { name: string }).name === 'providers'
      ) {
        hasProvidersDestructured = true;
      }
    }
  });

  // Track which v6 names we introduce for the destructured-import path
  const usedV6Names = new Set<string>();

  // ── 1. Namespace usage: ethers.providers.X → ethers.Y ───────────────────
  if (hasEthersNamespace) {

    // new ethers.providers.X(args) → new ethers.Y(args)
    root
      .find(j.NewExpression, (node: NewExpression): boolean => {
        const callee = node.callee;
        return (
          callee.type === 'MemberExpression' &&
          isNamespacedNew(callee as MemberExpression, 'ethers')
        );
      })
      .replaceWith((path: ASTPath<NewExpression>) => {
        const callee = path.node.callee as MemberExpression;
        const v5Name = (callee.property as { name: string }).name;
        const v6Name = PROVIDER_MAP[v5Name];
        return j.newExpression(
          j.memberExpression(j.identifier('ethers'), j.identifier(v6Name)),
          path.node.arguments
        );
      });

    // Type annotation: ethers.providers.X → ethers.Y
    root
      .find(j.TSTypeReference, (node: TSTypeReference): boolean =>
        isQN2(node.typeName, 'ethers', 'providers')
      )
      .replaceWith((path: ASTPath<TSTypeReference>) => {
        const v5Name = rightName(path.node.typeName as QualifiedName);
        const v6Name = PROVIDER_MAP[v5Name];
        return j.tsTypeReference(
          j.tsQualifiedName(j.identifier('ethers'), j.identifier(v6Name)),
          path.node.typeParameters ?? null
        );
      });
  }

  // ── 2. Destructured usage: providers.X → bare name + update import ───────
  if (hasProvidersDestructured) {

    // new providers.X(args) → new Y(args)
    root
      .find(j.NewExpression, (node: NewExpression): boolean => {
        const callee = node.callee;
        return (
          callee.type === 'MemberExpression' &&
          isDestructuredNew(callee as MemberExpression)
        );
      })
      .replaceWith((path: ASTPath<NewExpression>) => {
        const callee = path.node.callee as MemberExpression;
        const v5Name = (callee.property as { name: string }).name;
        const v6Name = PROVIDER_MAP[v5Name];
        usedV6Names.add(v6Name);
        return j.newExpression(j.identifier(v6Name), path.node.arguments);
      });

    // Type annotation: providers.X → Y (bare)
    root
      .find(j.TSTypeReference, (node: TSTypeReference): boolean =>
        isQN1(node.typeName, 'providers')
      )
      .replaceWith((path: ASTPath<TSTypeReference>) => {
        const v5Name = rightName(path.node.typeName as QualifiedName);
        const v6Name = PROVIDER_MAP[v5Name];
        usedV6Names.add(v6Name);
        return j.tsTypeReference(
          j.identifier(v6Name),
          path.node.typeParameters ?? null
        );
      });

    // ── Update import declaration ──────────────────────────────────────────
    // Only when we actually replaced something
    if (usedV6Names.size > 0) {
      ethersImports.forEach((path) => {
        const specifiers = path.node.specifiers ?? [];

        // Drop `providers`
        const filtered = specifiers.filter(
          (s) =>
            !(
              s.type === 'ImportSpecifier' &&
              s.imported.type === 'Identifier' &&
              (s.imported as { name: string }).name === 'providers'
            )
        );

        // Collect already-imported names to avoid duplicates
        const existingNames = new Set(
          filtered
            .filter((s) => s.type === 'ImportSpecifier')
            .map((s) => (s as { imported: { name: string } }).imported.name)
        );

        // Append new v6 names in sorted order for deterministic output
        for (const name of [...usedV6Names].sort()) {
          if (!existingNames.has(name)) {
            filtered.push(j.importSpecifier(j.identifier(name)));
          }
        }

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
