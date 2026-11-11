import type { FileInfo, API, ASTPath, CallExpression, ImportDeclaration } from 'jscodeshift';
import { bindsEthersNamespace } from './ethers-import';

/**
 * hexlify(number | bigint) → toBeHex(...)
 *
 * v5 hexlify() accepted numbers and BigNumbers; v6 hexlify() only accepts
 * bytes and throws INVALID_ARGUMENT for anything else. toBeHex() gives the
 * same string v5 did ('0x00', '0x16e360'). Checked against ethers 5.8.0/6.17.0.
 *
 * Runs after rename-utils and bigNumber-to-bigint, so it sees v6 names:
 * ethers.hexlify(...), hexlify(...) imported from 'ethers', BigInt(...).
 *  - clearly numeric argument → toBeHex
 *  - clearly bytes or a string → unchanged
 *  - anything else            → unchanged, with a TODO
 */

const MARKER = 'TODO(ethers-codemod)';
const NUMERIC_CALLS = new Set(['parseUnits', 'parseEther', 'BigInt', 'Number', 'toBigInt', 'getBigInt', 'toNumber']);
const BYTES_CALLS = new Set([
  'randomBytes', 'toUtf8Bytes', 'getBytes', 'getBytesCopy', 'arrayify', 'concat', 'zeroPadValue',
  'zeroPadBytes', 'keccak256', 'sha256', 'solidityPacked', 'dataSlice', 'stripZerosLeft',
]);
const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '**', '<<', '>>', '&', '|', '^']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

/** The function name of a call: foo(...) → foo, ethers.foo(...) → foo. */
function calleeName(node: AnyNode): string | null {
  if (node.type !== 'CallExpression') return null;
  const c = node.callee;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') return c.property.name;
  return null;
}

function isNumeric(node: AnyNode): boolean {
  if (!node) return false;
  if (node.type === 'NumericLiteral' || node.type === 'BigIntLiteral') return true;
  if (node.type === 'Literal' && (typeof node.value === 'number' || typeof node.value === 'bigint')) return true;
  if (node.type === 'UnaryExpression' && node.operator === '-') return isNumeric(node.argument);
  if (node.type === 'BinaryExpression' && ARITHMETIC.has(node.operator)) {
    return isNumeric(node.left) || isNumeric(node.right);
  }
  const name = calleeName(node);
  return name != null && NUMERIC_CALLS.has(name);
}

function isBytesOrString(node: AnyNode): boolean {
  if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral') return true;
  if (node.type === 'Literal' && typeof node.value === 'string') return true;
  if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'Uint8Array') return true;
  if (node.type === 'ArrayExpression') return true;
  const name = calleeName(node);
  return name != null && BYTES_CALLS.has(name);
}

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  const ethersImports = root.find(j.ImportDeclaration, (n: ImportDeclaration) => n.source.value === 'ethers');
  if (ethersImports.size() === 0) return file.source;

  let ethersIsLibrary = false;
  let hexlifyLocal: string | null = null;
  ethersImports.forEach((p) => {
    for (const s of p.node.specifiers ?? []) {
      if (bindsEthersNamespace(s)) ethersIsLibrary = true;
      if (s.type === 'ImportSpecifier' && (s.imported as { name: string }).name === 'hexlify') {
        hexlifyLocal = (s.local as { name: string } | null)?.name ?? 'hexlify';
      }
    }
  });

  const calls = root.find(j.CallExpression, (n: CallExpression) => {
    const c = n.callee as AnyNode;
    if (n.arguments.length !== 1) return false;
    if (hexlifyLocal && c.type === 'Identifier' && c.name === hexlifyLocal) return true;
    return (
      ethersIsLibrary &&
      c.type === 'MemberExpression' && !c.computed &&
      c.object.type === 'Identifier' && c.object.name === 'ethers' &&
      c.property.type === 'Identifier' && c.property.name === 'hexlify'
    );
  });
  if (calls.size() === 0) return file.source;

  let usedBareToBeHex = false;
  let remainingBareHexlify = 0;

  calls.forEach((path: ASTPath<CallExpression>) => {
    const arg = path.node.arguments[0] as AnyNode;
    const bare = (path.node.callee as AnyNode).type === 'Identifier';
    if (isNumeric(arg)) {
      if (bare) {
        usedBareToBeHex = true;
        path.node.callee = j.identifier('toBeHex');
      } else {
        (path.node.callee as AnyNode).property = j.identifier('toBeHex');
      }
      return;
    }
    if (bare) remainingBareHexlify++;
    if (isBytesOrString(arg)) return;

    // Unknown argument: leave it, but say why it might break
    let p: AnyNode = path;
    while (p.parent && !j.Statement.check(p.node)) p = p.parent;
    const existing: AnyNode[] = p.node.comments ?? [];
    if (!existing.some((c) => c.value?.includes(MARKER))) {
      p.node.comments = [
        {
          type: 'CommentLine',
          value: ` ${MARKER}: v6 hexlify() only accepts bytes; if this value is a number or bigint, use toBeHex()`,
          leading: true,
          trailing: false,
        },
        ...existing,
      ];
    }
  });

  if (usedBareToBeHex) {
    ethersImports.forEach((p) => {
      const specs = p.node.specifiers ?? [];
      if (!specs.some((s) => s.type === 'ImportSpecifier')) return;
      let next = specs.filter(
        (s) => !(remainingBareHexlify === 0 && s.type === 'ImportSpecifier' && (s.imported as { name: string }).name === 'hexlify')
      );
      if (!next.some((s) => s.type === 'ImportSpecifier' && (s.imported as { name: string }).name === 'toBeHex')) {
        next = [...next, j.importSpecifier(j.identifier('toBeHex'))];
      }
      p.node.specifiers = next;
    });
  }

  return root.toSource({ quote: 'single' });
}
