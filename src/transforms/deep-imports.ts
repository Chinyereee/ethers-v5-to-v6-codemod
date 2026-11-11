import type { FileInfo, API, ASTPath, ImportDeclaration } from 'jscodeshift';
import { ETHERS_V6_EXPORTS } from './ethers-v6-exports';
import { UTILS_TO_ETHERS } from './rename-utils';
import { PROVIDER_MAP } from './rename-providers';
import { CONSTANTS_TO_ETHERS, CONSTANTS_TO_BIGINT } from './rename-constants';

/**
 * import { X } from 'ethers/lib/utils' | '@ethersproject/<pkg>'  →  import { X } from 'ethers'
 *
 * ethers v6 has no `ethers/lib/*` paths, and the v5 `@ethersproject/*`
 * sub-packages are not its dependencies, so after upgrading these imports fail.
 * Named imports move to 'ethers' with their v6 names. This runs first, so the
 * later transforms (BigNumber, providers, ...) see ordinary 'ethers' imports.
 *
 *  - renamed in v6:    arrayify → getBytes, Web3Provider → BrowserProvider,
 *                      AddressZero → ZeroAddress, ...  (references are renamed too)
 *  - numeric constants: Zero/One/Two/NegativeOne → 0n/1n/2n/-1n
 *  - removed helpers:  splitSignature(x) → Signature.from(x)
 *                      joinSignature(x)  → Signature.from(x).serialized
 *                      defaultAbiCoder   → AbiCoder.defaultAbiCoder()
 *  - BigNumber:        moved as-is; the BigNumber transform rewrites it
 *  - anything v6 doesn't export, and namespace/default imports: kept and flagged
 */

const DEEP_SOURCE = /^(ethers\/lib(\/.*)?|@ethersproject\/[^/]+)$/;
const MARKER = 'TODO(ethers-codemod)';

const RENAMES: Record<string, string> = {};
for (const map of [UTILS_TO_ETHERS, PROVIDER_MAP, CONSTANTS_TO_ETHERS]) {
  for (const [v5, v6] of Object.entries(map)) if (v5 !== v6) RENAMES[v5] = v6;
}

/** Names handled by a call-shape rewrite rather than a plain rename. */
const SPECIAL = new Set(['splitSignature', 'joinSignature', 'defaultAbiCoder']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  const deepImports = root.find(j.ImportDeclaration, (node: ImportDeclaration) =>
    typeof node.source.value === 'string' && DEEP_SOURCE.test(node.source.value)
  );
  if (deepImports.size() === 0) return file.source;

  function addTodo(path: ASTPath<AnyNode>, text: string): void {
    const existing: AnyNode[] = path.node.comments ?? [];
    if (existing.some((c) => c.value?.includes(MARKER))) return;
    path.node.comments = [
      { type: 'CommentLine', value: ` ${MARKER}: ${text}`, leading: true, trailing: false },
      ...existing,
    ];
  }

  /** Identifier references to `name` (not property keys, member properties or import specifiers). */
  function references(name: string) {
    return root.find(j.Identifier, { name }).filter((p: ASTPath<AnyNode>) => {
      const parent = p.parent.node;
      if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier') return false;
      if (parent.type === 'MemberExpression' && parent.property === p.node && !parent.computed) return false;
      if ((parent.type === 'ObjectProperty' || parent.type === 'Property') && parent.key === p.node && !parent.computed && !parent.shorthand) return false;
      if (parent.type === 'TSQualifiedName' && parent.right === p.node) return false;
      return true;
    });
  }

  // Imported names to add to 'ethers': imported → local (null = same as imported)
  const toAdd = new Map<string, string | null>();

  deepImports.forEach((declPath: ASTPath<ImportDeclaration>) => {
    const decl = declPath.node;
    const source = String(decl.source.value);
    const kept: AnyNode[] = [];

    for (const spec of decl.specifiers ?? []) {
      if (spec.type !== 'ImportSpecifier') {
        kept.push(spec);
        addTodo(declPath, `'${source}' does not exist in ethers v6; import what you need from 'ethers'`);
        continue;
      }
      const imported = (spec.imported as { name: string }).name;
      const local: string = (spec.local as { name: string } | null | undefined)?.name ?? imported;
      const aliased = local !== imported;

      if (SPECIAL.has(imported)) {
        const target = imported === 'defaultAbiCoder' ? 'AbiCoder' : 'Signature';
        toAdd.set(target, null);
        references(local).forEach((p: ASTPath<AnyNode>) => {
          const parent = p.parent.node;
          const isCall = parent.type === 'CallExpression' && parent.callee === p.node;
          if (imported === 'defaultAbiCoder') {
            p.replace(j.callExpression(j.memberExpression(j.identifier('AbiCoder'), j.identifier('defaultAbiCoder')), []));
          } else if (isCall) {
            const from = j.callExpression(j.memberExpression(j.identifier('Signature'), j.identifier('from')), parent.arguments);
            p.parent.replace(imported === 'joinSignature' ? j.memberExpression(from, j.identifier('serialized')) : from);
          } else {
            addTodo(declPath, `${imported} was removed in ethers v6; use Signature.from(x)${imported === 'joinSignature' ? '.serialized' : ''}`);
          }
        });
        continue;
      }

      if (imported in CONSTANTS_TO_BIGINT) {
        const literal = CONSTANTS_TO_BIGINT[imported];
        references(local).replaceWith(() =>
          literal.startsWith('-') ? j.unaryExpression('-', j.bigIntLiteral(literal.slice(1, -1))) : j.bigIntLiteral(literal.slice(0, -1))
        );
        continue;
      }

      const v6Name = RENAMES[imported] ?? imported;
      if (imported === 'BigNumber' || ETHERS_V6_EXPORTS.has(v6Name)) {
        if (aliased) {
          toAdd.set(v6Name, local);
        } else {
          toAdd.set(v6Name, null);
          if (v6Name !== imported) {
            references(imported).forEach((p: ASTPath<AnyNode>) => {
              p.node.name = v6Name;
            });
          }
        }
        continue;
      }

      kept.push(spec);
      addTodo(declPath, `${imported} is not exported by ethers v6; find its replacement`);
    }

    if (kept.length === 0) {
      // keep the declaration's leading comments if it is removed
      j(declPath).remove();
    } else {
      decl.specifiers = kept;
    }
  });

  if (toAdd.size > 0) {
    const specifiers = [...toAdd].map(([imported, local]) =>
      local ? j.importSpecifier(j.identifier(imported), j.identifier(local)) : j.importSpecifier(j.identifier(imported))
    );

    const existing = root
      .find(j.ImportDeclaration, (node: ImportDeclaration) =>
        node.source.value === 'ethers' &&
        (node.specifiers ?? []).every((s) => s.type === 'ImportSpecifier')
      )
      .paths()[0];

    if (existing) {
      const have = new Set(
        (existing.node.specifiers ?? []).map((s) => (s as { imported: { name: string } }).imported.name)
      );
      for (const s of specifiers) {
        if (!have.has((s.imported as { name: string }).name)) existing.node.specifiers!.push(s);
      }
    } else {
      const decl = j.importDeclaration(specifiers, j.stringLiteral('ethers'));
      const imports = root.find(j.ImportDeclaration).paths();
      if (imports.length > 0) {
        j(imports[0]).insertBefore(decl);
      } else {
        root.get().node.program.body.unshift(decl);
      }
    }
  }

  return root.toSource({ quote: 'single' });
}
