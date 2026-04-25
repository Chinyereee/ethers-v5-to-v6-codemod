import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const TODO_COMMENT =
  "// TODO: ethers v6 - replace getGasPrice() with getFeeData() and access .gasPrice, .maxFeePerGas, or .maxPriorityFeePerGas";

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const source = root.source();
  const edits: Edit[] = [];

  // Ranges claimed by step 1 (await expressions).  The call_expression inside
  // each await_expression has a byte range fully contained within the outer
  // await_expression range, so the guard prevents step 2 from inserting a
  // TODO comment on calls that have already been auto-migrated.
  const covered: Array<{ start: number; end: number }> = [];

  // Line starts that have already received a TODO in this pass — prevents
  // duplicate insertions when multiple non-awaited calls share one line.
  const commentedLineStarts = new Set<number>();

  function isCovered(node: SgNode<TSX>): boolean {
    const r = node.range();
    return covered.some(
      (e) => r.start.index >= e.start && r.end.index <= e.end,
    );
  }

  // Insert a line comment immediately above the line that contains `node`.
  // Idempotent across runs: checks whether the preceding source line already
  // contains the TODO marker before inserting.
  function insertLineComment(node: SgNode<TSX>, comment: string): void {
    const r = node.range();
    // Byte offset of the first character on this line.
    const lineStart = source.lastIndexOf("\n", r.start.index - 1) + 1;

    // Already inserted during this run.
    if (commentedLineStarts.has(lineStart)) return;

    // Already present from a previous run — inspect the line directly above.
    if (lineStart > 0) {
      const prevLineEnd   = lineStart - 1; // index of the \n ending the previous line
      const prevLineStart = source.lastIndexOf("\n", prevLineEnd - 1) + 1;
      const prevLine      = source.slice(prevLineStart, prevLineEnd);
      if (prevLine.includes("TODO: ethers v6")) return;
    }

    commentedLineStarts.add(lineStart);
    const indent = source.slice(lineStart, r.start.index).match(/^\s*/)?.[0] ?? "";
    edits.push({ startPos: lineStart, endPos: lineStart, insertedText: `${indent}${comment}\n` });
  }

  // ── Step 1: await $OBJ.getGasPrice() → (await $OBJ.getFeeData()).gasPrice ──
  //
  // The pattern matches the entire await_expression node.  $OBJ captures the
  // method receiver (provider, signer, provider.connect(s), …).
  // The replacement wraps the new await in parens so that .gasPrice binds to
  // the resolved FeeData value, not to the Promise.
  //
  // Must run BEFORE step 2 so that the await_expression ranges are recorded in
  // `covered` before the call_expression sweep begins.
  for (const node of rootNode.findAll({ rule: { pattern: "await $OBJ.getGasPrice()" } })) {
    if (isCovered(node)) continue;
    const obj = node.getMatch("OBJ")?.text() ?? "";
    const r = node.range();
    covered.push({ start: r.start.index, end: r.end.index });
    edits.push(node.replace(`(await ${obj}.getFeeData()).gasPrice`));
  }

  // ── Step 2: $OBJ.getGasPrice() (non-awaited) → TODO comment ──────────────
  //
  // Non-awaited usage may be part of a Promise chain, .then() handler, or
  // fire-and-forget call — ambiguous enough that we leave the code untouched
  // and flag it for manual review.
  //
  // isCovered() skips calls whose byte range falls inside an already-processed
  // await_expression (i.e. the call_expression child of a matched step-1 node).
  for (const node of rootNode.findAll({ rule: { pattern: "$OBJ.getGasPrice()" } })) {
    if (isCovered(node)) continue;
    insertLineComment(node, TODO_COMMENT);
  }

  // ── Step 3: ethers.providers.FeeData type annotation → ethers.FeeData ─────
  //
  // TSX parses type-position `ethers.providers.FeeData` as a member_expression.
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.providers.FeeData", kind: "member_expression" } })) {
    if (isCovered(node)) continue;
    edits.push(node.replace("ethers.FeeData"));
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
