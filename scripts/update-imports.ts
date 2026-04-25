import type { Transform, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

// v5-only named specifiers that the other transforms should have already
// removed from usage.  They can be safely dropped from import statements.
const DEPRECATED = new Set(["utils", "BigNumber", "providers", "constants"]);

// Return the imported binding name from a specifier (handles `Foo as Bar`).
function importedName(spec: string): string {
  return spec.split(/\s+as\s+/)[0].trim();
}

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const source = root.source();
  const edits: Edit[] = [];

  // Run two pattern passes to cover both quote styles.  In most ast-grep
  // builds the pattern string literal is matched literally (single ≠ double
  // quote), so we must search for each style separately.
  const PATTERNS = [
    "import $$$SPECIFIERS from 'ethers'",
    'import $$$SPECIFIERS from "ethers"',
  ];

  // Track exact start:end positions so a node that matches both patterns
  // (shouldn't happen, but defensive) is only processed once.
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    for (const node of rootNode.findAll({ rule: { pattern } })) {
      const r   = node.range();
      const key = `${r.start.index}:${r.end.index}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const nodeText = node.text();

      // Skip namespace imports (`import * as ethers`) and default imports
      // (`import ethers`).  Only process named imports (`import { ... }`).
      if (!nodeText.includes("{")) continue;

      // ── Parse the { ... } content from the raw node text ──────────────────
      // `[^}]+` is safe here: import specifier names cannot contain `}`.
      const braceMatch = nodeText.match(/\{([^}]+)\}/);
      if (!braceMatch) continue;

      const specs: string[] = braceMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // ── Filter out deprecated specifiers ──────────────────────────────────
      const remaining = specs.filter((s) => !DEPRECATED.has(importedName(s)));

      // Nothing was removed — leave the node completely untouched.
      if (remaining.length === specs.length) continue;

      if (remaining.length === 0) {
        // All specifiers were deprecated — delete the entire import statement,
        // including the trailing newline so the line itself disappears.
        const endPos =
          r.end.index < source.length && source[r.end.index] === "\n"
            ? r.end.index + 1
            : r.end.index;
        edits.push({ startPos: r.start.index, endPos, insertedText: "" });
      } else {
        // ── Reconstruct with only the surviving specifiers ─────────────────
        // Preserve the original quote character and trailing semicolon.
        const quote = nodeText.includes('"ethers"') ? '"' : "'";
        const semi  = /;\s*$/.test(nodeText) ? ";" : "";
        const replacement = `import { ${remaining.join(", ")} } from ${quote}ethers${quote}${semi}`;
        edits.push(node.replace(replacement));
      }
    }
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
