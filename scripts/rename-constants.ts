import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

// Each entry: [v5 member_expression pattern, v6 replacement text]
const RENAMES: Array<[string, string]> = [
  // Simple renames — ethers.constants.X → ethers.Y
  ["ethers.constants.AddressZero",  "ethers.ZeroAddress"],
  ["ethers.constants.HashZero",     "ethers.ZeroHash"],
  ["ethers.constants.MaxUint256",   "ethers.MaxUint256"],
  ["ethers.constants.MinInt256",    "ethers.MinInt256"],
  ["ethers.constants.WeiPerEther",  "ethers.WeiPerEther"],
  ["ethers.constants.EtherSymbol",  "ethers.EtherSymbol"],
  // Numeric constants removed in v6 — replace with bigint literals
  ["ethers.constants.NegativeOne",  "-1n"],
  ["ethers.constants.Zero",         "0n"],
  ["ethers.constants.One",          "1n"],
  ["ethers.constants.Two",          "2n"],
];

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // Covered-range guard — consistent with the other transforms in this suite.
  // In practice no two patterns in RENAMES produce overlapping nodes, but the
  // guard is kept for correctness and future-proofing.
  const covered: Array<{ start: number; end: number }> = [];

  function isCovered(node: SgNode<TSX>): boolean {
    const r = node.range();
    return covered.some(
      (e) => r.start.index >= e.start && r.end.index <= e.end,
    );
  }

  for (const [pattern, replacement] of RENAMES) {
    for (const node of rootNode.findAll({ rule: { pattern, kind: "member_expression" } })) {
      if (isCovered(node)) continue;
      const r = node.range();
      covered.push({ start: r.start.index, end: r.end.index });
      edits.push(node.replace(replacement));
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
