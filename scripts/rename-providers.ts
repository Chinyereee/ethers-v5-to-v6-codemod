import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const STATIC_TODO =
  "// TODO: ethers v6 - if called with a network arg, add { staticNetwork: network } as third arg";

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const source = root.source();
  const edits: Edit[] = [];

  // Ranges already claimed by constructor patterns — used to prevent
  // the type-reference pass from pushing overlapping edits on the same
  // member_expression that is also a new-expression callee.
  const covered: Array<{ start: number; end: number }> = [];

  function pushEdit(node: SgNode<TSX>, replacement: string): void {
    const r = node.range();
    covered.push({ start: r.start.index, end: r.end.index });
    edits.push(node.replace(replacement));
  }

  function isCovered(node: SgNode<TSX>): boolean {
    const r = node.range();
    return covered.some(
      (e) => r.start.index >= e.start && r.end.index <= e.end,
    );
  }

  // Line starts that have already received a TODO comment this pass —
  // guards against duplicate insertions when two StaticJsonRpcProvider
  // calls appear on the same source line (unlikely but possible).
  const commentedLineStarts = new Set<number>();

  function insertLineComment(node: SgNode<TSX>, comment: string): void {
    const r = node.range();
    // Find the byte offset of the first character on this line.
    // lastIndexOf('\n', pos) returns -1 when there is no preceding newline,
    // so +1 correctly resolves to 0 (start of file / start of line).
    const lineStart = source.lastIndexOf("\n", r.start.index - 1) + 1;
    if (commentedLineStarts.has(lineStart)) return;
    commentedLineStarts.add(lineStart);
    // Preserve the line's leading indentation so the comment aligns with
    // the code below it.
    const indent = source.slice(lineStart, r.start.index).match(/^\s*/)?.[0] ?? "";
    edits.push({ startPos: lineStart, endPos: lineStart, insertedText: `${indent}${comment}\n` });
  }

  // ── Constructor patterns (1-7) — run before type-reference patterns ────────
  // Processing new-expressions first records their ranges in `covered` so the
  // member_expression sweep below skips callees that are already rewritten.

  // 1. new ethers.providers.Web3Provider($$$ARGS) → new ethers.BrowserProvider($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "new ethers.providers.Web3Provider($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    pushEdit(node, `new ethers.BrowserProvider(${args})`);
  }

  // 2. new ethers.providers.JsonRpcProvider($$$ARGS) → new ethers.JsonRpcProvider($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "new ethers.providers.JsonRpcProvider($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    pushEdit(node, `new ethers.JsonRpcProvider(${args})`);
  }

  // 3. new ethers.providers.WebSocketProvider($$$ARGS) → new ethers.WebSocketProvider($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "new ethers.providers.WebSocketProvider($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    pushEdit(node, `new ethers.WebSocketProvider(${args})`);
  }

  // 4. new ethers.providers.FallbackProvider($$$ARGS) → new ethers.FallbackProvider($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "new ethers.providers.FallbackProvider($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    pushEdit(node, `new ethers.FallbackProvider(${args})`);
  }

  // 5. new ethers.providers.StaticJsonRpcProvider($$$ARGS) → new ethers.JsonRpcProvider($$$ARGS)
  //    + TODO comment prepended to the containing line
  for (const node of rootNode.findAll({ rule: { pattern: "new ethers.providers.StaticJsonRpcProvider($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    insertLineComment(node, STATIC_TODO);
    pushEdit(node, `new ethers.JsonRpcProvider(${args})`);
  }

  // 6. new ethers.providers.AlchemyProvider($$$ARGS) → new ethers.AlchemyProvider($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "new ethers.providers.AlchemyProvider($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    pushEdit(node, `new ethers.AlchemyProvider(${args})`);
  }

  // 7. new ethers.providers.InfuraProvider($$$ARGS) → new ethers.InfuraProvider($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "new ethers.providers.InfuraProvider($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    pushEdit(node, `new ethers.InfuraProvider(${args})`);
  }

  // ── Type-reference patterns ────────────────────────────────────────────────
  // TSX represents `ethers.providers.X` in type-annotation position as a plain
  // member_expression node — the same kind as a value-position callee.  The
  // covered-range guard skips nodes already consumed by the constructor pass
  // above, leaving only genuine type-annotation occurrences to be rewritten.

  const TYPE_RENAMES: Array<[string, string]> = [
    ["ethers.providers.Web3Provider",          "ethers.BrowserProvider"],
    ["ethers.providers.JsonRpcProvider",        "ethers.JsonRpcProvider"],
    ["ethers.providers.WebSocketProvider",      "ethers.WebSocketProvider"],
    ["ethers.providers.FallbackProvider",       "ethers.FallbackProvider"],
    ["ethers.providers.StaticJsonRpcProvider",  "ethers.JsonRpcProvider"],
    ["ethers.providers.AlchemyProvider",        "ethers.AlchemyProvider"],
    ["ethers.providers.InfuraProvider",         "ethers.InfuraProvider"],
    ["ethers.providers.FeeData",                "ethers.FeeData"],
  ];

  for (const [from, to] of TYPE_RENAMES) {
    for (const node of rootNode.findAll({ rule: { pattern: from, kind: "member_expression" } })) {
      if (isCovered(node)) continue;
      edits.push(node.replace(to));
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
