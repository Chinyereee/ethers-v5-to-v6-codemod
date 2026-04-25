import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

// Pattern 1 (awaited): rename happened — developer must check if this was
// provider.sendTransaction (correct) or signer.sendTransaction (must revert).
const AWAIT_TODO =
  "// TODO: ethers v6 - verify this is provider.sendTransaction (now broadcastTransaction), not signer.sendTransaction (which stays the same in v6)";

// Pattern 2 (non-awaited): left unchanged — developer must decide and migrate.
const PLAIN_TODO =
  "// TODO: ethers v6 - sendTransaction is now broadcastTransaction on providers (signer.sendTransaction stays the same)";

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const source = root.source();
  const edits: Edit[] = [];

  // Ranges claimed by pattern 1 (awaited sendTransaction expressions).
  // Used exclusively to guard pattern 2 — NOT applied to patterns 3/4, because
  // ethers.utils.parseTransaction / serializeTransaction can appear as arguments
  // to sendTransaction and must still be transformed even when nested inside a
  // covered await_expression range.
  const sendTxCovered: Array<{ start: number; end: number }> = [];

  // Line starts that have already received a TODO in this pass.
  const commentedLineStarts = new Set<number>();

  function isSendTxCovered(node: SgNode<TSX>): boolean {
    const r = node.range();
    return sendTxCovered.some(
      (e) => r.start.index >= e.start && r.end.index <= e.end,
    );
  }

  // Insert `comment` as a new line immediately above the line that contains
  // `node`.  Zero-length Edit (startPos === endPos) = pure text insertion.
  //
  // Idempotent across runs: if the line directly above already contains the
  // "TODO: ethers v6" marker (left by a previous run), the insertion is
  // skipped.  Also deduplicates within the current run via commentedLineStarts.
  function insertLineComment(node: SgNode<TSX>, comment: string): void {
    const r = node.range();
    const lineStart = source.lastIndexOf("\n", r.start.index - 1) + 1;

    if (commentedLineStarts.has(lineStart)) return;

    if (lineStart > 0) {
      const prevLineEnd   = lineStart - 1;
      const prevLineStart = source.lastIndexOf("\n", prevLineEnd - 1) + 1;
      const prevLine      = source.slice(prevLineStart, prevLineEnd);
      if (prevLine.includes("TODO: ethers v6")) return;
    }

    commentedLineStarts.add(lineStart);
    const indent = source.slice(lineStart, r.start.index).match(/^\s*/)?.[0] ?? "";
    edits.push({ startPos: lineStart, endPos: lineStart, insertedText: `${indent}${comment}\n` });
  }

  // ── Pattern 1: await $OBJ.sendTransaction($$$ARGS) ────────────────────────
  //   → await $OBJ.broadcastTransaction($$$ARGS)  +  TODO comment
  //
  // The entire await_expression node is replaced so the await keyword is
  // preserved verbatim.  The matched range is recorded in sendTxCovered so
  // pattern 2 does not also insert a TODO on the same inner call.
  //
  // Must run BEFORE pattern 2.
  for (const node of rootNode.findAll({ rule: { pattern: "await $OBJ.sendTransaction($$$ARGS)" } })) {
    const obj  = node.getMatch("OBJ")?.text() ?? "";
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    const r    = node.range();
    sendTxCovered.push({ start: r.start.index, end: r.end.index });
    insertLineComment(node, AWAIT_TODO);
    edits.push(node.replace(`await ${obj}.broadcastTransaction(${args})`));
  }

  // ── Pattern 2: $OBJ.sendTransaction($$$ARGS) (non-awaited) ───────────────
  //   → unchanged  +  TODO comment
  //
  // The call_expression matched here has a byte range contained within the
  // await_expression range recorded in step 1, so isSendTxCovered() skips
  // calls that were already renamed above.
  for (const node of rootNode.findAll({ rule: { pattern: "$OBJ.sendTransaction($$$ARGS)" } })) {
    if (isSendTxCovered(node)) continue;
    insertLineComment(node, PLAIN_TODO);
  }

  // ── Pattern 3: ethers.utils.parseTransaction($ARG) ───────────────────────
  //   → ethers.Transaction.from($ARG)
  //
  // No covered-range guard — this pattern must fire even when the call appears
  // as an argument inside a sendTransaction expression.
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.parseTransaction($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.Transaction.from(${arg})`));
  }

  // ── Pattern 4: ethers.utils.serializeTransaction($$$ARGS) ────────────────
  //   → ethers.Transaction.from($$$ARGS).serialized
  //
  // Same reasoning as pattern 3 — no covered-range guard.
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.serializeTransaction($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.Transaction.from(${args}).serialized`));
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
