import type { Transform, Edit, SgNode } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

// v5 contract bucket → v6 method suffix
// Pattern:  receiver.[bucket].[method](args)
//        →  receiver.[method].[suffix](args)
const BUCKETS: Array<{ pattern: string; suffix: string }> = [
  { pattern: "$OBJ.callStatic.$METHOD($$$ARGS)",           suffix: "staticCall"           },
  { pattern: "$OBJ.estimateGas.$METHOD($$$ARGS)",          suffix: "estimateGas"          },
  { pattern: "$OBJ.populateTransaction.$METHOD($$$ARGS)",  suffix: "populateTransaction"  },
  { pattern: "$OBJ.functions.$METHOD($$$ARGS)",            suffix: "staticCallResult"     },
];

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // Covered-range guard — the four bucket patterns are mutually exclusive
  // (different middle property names), so in realistic code they will never
  // produce overlapping nodes.  The guard is included for correctness: if the
  // same bucket somehow appears at two nesting levels, the outer match is
  // recorded and the inner one is skipped rather than generating conflicting
  // byte-range edits that commitEdits cannot reconcile.
  const covered: Array<{ start: number; end: number }> = [];

  function isCovered(node: SgNode<TSX>): boolean {
    const r = node.range();
    return covered.some(
      (e) => r.start.index >= e.start && r.end.index <= e.end,
    );
  }

  for (const { pattern, suffix } of BUCKETS) {
    for (const node of rootNode.findAll({ rule: { pattern } })) {
      if (isCovered(node)) continue;

      const obj    = node.getMatch("OBJ")?.text()                          ?? "";
      const method = node.getMatch("METHOD")?.text()                       ?? "";
      const args   = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");

      const r = node.range();
      covered.push({ start: r.start.index, end: r.end.index });
      edits.push(node.replace(`${obj}.${method}.${suffix}(${args})`));
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
