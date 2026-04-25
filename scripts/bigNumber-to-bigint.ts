import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // Track ranges already claimed by chained patterns so that the bare
  // BigNumber.from() passes (patterns 1-2) don't push overlapping edits.
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

  // ── Chained patterns (3-13) — MUST run before bare from() patterns ─────────
  // ast-grep's findAll returns the most-specific node for each match, so
  // ethers.BigNumber.from($ARG).toNumber() and ethers.BigNumber.from($ARG) are
  // two distinct (overlapping) nodes. Processing chained patterns first and
  // recording their ranges lets the bare-from passes skip sub-expressions that
  // are already covered.

  // 3. ethers.BigNumber.from($ARG).toNumber() → Number(BigInt($ARG))
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).toNumber()" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    pushEdit(node, `Number(BigInt(${arg}))`);
  }

  // 4. ethers.BigNumber.from($ARG).toHexString() → BigInt($ARG).toString(16)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).toHexString()" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}).toString(16)`);
  }

  // 5. ethers.BigNumber.from($ARG).add($OTHER) → BigInt($ARG) + BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).add($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) + BigInt(${other})`);
  }

  // 6. ethers.BigNumber.from($ARG).sub($OTHER) → BigInt($ARG) - BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).sub($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) - BigInt(${other})`);
  }

  // 7. ethers.BigNumber.from($ARG).mul($OTHER) → BigInt($ARG) * BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).mul($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) * BigInt(${other})`);
  }

  // 8. ethers.BigNumber.from($ARG).div($OTHER) → BigInt($ARG) / BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).div($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) / BigInt(${other})`);
  }

  // 9. ethers.BigNumber.from($ARG).eq($OTHER) → BigInt($ARG) === BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).eq($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) === BigInt(${other})`);
  }

  // 10. ethers.BigNumber.from($ARG).gt($OTHER) → BigInt($ARG) > BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).gt($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) > BigInt(${other})`);
  }

  // 11. ethers.BigNumber.from($ARG).gte($OTHER) → BigInt($ARG) >= BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).gte($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) >= BigInt(${other})`);
  }

  // 12. ethers.BigNumber.from($ARG).lt($OTHER) → BigInt($ARG) < BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).lt($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) < BigInt(${other})`);
  }

  // 13. ethers.BigNumber.from($ARG).lte($OTHER) → BigInt($ARG) <= BigInt($OTHER)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG).lte($OTHER)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    const other = node.getMatch("OTHER")?.text() ?? "";
    pushEdit(node, `BigInt(${arg}) <= BigInt(${other})`);
  }

  // ── Bare from() patterns (1-2) — skip sub-expressions already covered above ─

  // 1. ethers.BigNumber.from($ARG) → BigInt($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.BigNumber.from($ARG)" } })) {
    if (isCovered(node)) continue;
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`BigInt(${arg})`));
  }

  // 2. BigNumber.from($ARG) → BigInt($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "BigNumber.from($ARG)" } })) {
    if (isCovered(node)) continue;
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`BigInt(${arg})`));
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
