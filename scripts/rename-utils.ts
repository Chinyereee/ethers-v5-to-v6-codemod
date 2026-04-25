import type { Transform, Edit } from "codemod:ast-grep";
import type TSX from "codemod:ast-grep/langs/tsx";

const transform: Transform<TSX> = (root) => {
  const rootNode = root.root();
  const edits: Edit[] = [];

  // 1. ethers.utils.parseEther($ARG) → ethers.parseEther($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.parseEther($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.parseEther(${arg})`));
  }

  // 2. ethers.utils.formatEther($ARG) → ethers.formatEther($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.formatEther($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.formatEther(${arg})`));
  }

  // 3. ethers.utils.parseUnits($$$ARGS) → ethers.parseUnits($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.parseUnits($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.parseUnits(${args})`));
  }

  // 4. ethers.utils.formatUnits($$$ARGS) → ethers.formatUnits($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.formatUnits($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.formatUnits(${args})`));
  }

  // 5. ethers.utils.keccak256($ARG) → ethers.keccak256($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.keccak256($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.keccak256(${arg})`));
  }

  // 6. ethers.utils.sha256($ARG) → ethers.sha256($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.sha256($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.sha256(${arg})`));
  }

  // 7. ethers.utils.toUtf8Bytes($ARG) → ethers.toUtf8Bytes($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.toUtf8Bytes($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.toUtf8Bytes(${arg})`));
  }

  // 8. ethers.utils.toUtf8String($ARG) → ethers.toUtf8String($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.toUtf8String($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.toUtf8String(${arg})`));
  }

  // 9. ethers.utils.hexlify($ARG) → ethers.hexlify($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.hexlify($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.hexlify(${arg})`));
  }

  // 10. ethers.utils.arrayify($ARG) → ethers.getBytes($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.arrayify($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.getBytes(${arg})`));
  }

  // 11. ethers.utils.hexZeroPad($$$ARGS) → ethers.zeroPadValue($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.hexZeroPad($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.zeroPadValue(${args})`));
  }

  // 12. ethers.utils.zeroPad($$$ARGS) → ethers.zeroPadBytes($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.zeroPad($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.zeroPadBytes(${args})`));
  }

  // 13. ethers.utils.isAddress($ARG) → ethers.isAddress($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.isAddress($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.isAddress(${arg})`));
  }

  // 14. ethers.utils.getAddress($ARG) → ethers.getAddress($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.getAddress($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.getAddress(${arg})`));
  }

  // 15. ethers.utils.id($ARG) → ethers.id($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.id($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.id(${arg})`));
  }

  // 16. ethers.utils.splitSignature($ARG) → ethers.Signature.from($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.splitSignature($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.Signature.from(${arg})`));
  }

  // 17. ethers.utils.joinSignature($ARG) → ethers.Signature.from($ARG).serialized
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.joinSignature($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.Signature.from(${arg}).serialized`));
  }

  // 18. ethers.utils.formatBytes32String($ARG) → ethers.encodeBytes32String($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.formatBytes32String($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.encodeBytes32String(${arg})`));
  }

  // 19. ethers.utils.parseBytes32String($ARG) → ethers.decodeBytes32String($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.parseBytes32String($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.decodeBytes32String(${arg})`));
  }

  // 20. ethers.utils.hexDataSlice($$$ARGS) → ethers.dataSlice($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.hexDataSlice($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.dataSlice(${args})`));
  }

  // 21. ethers.utils.hexValue($ARG) → ethers.toQuantity($ARG)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.hexValue($ARG)" } })) {
    const arg = node.getMatch("ARG")?.text() ?? "";
    edits.push(node.replace(`ethers.toQuantity(${arg})`));
  }

  // 22. ethers.utils.solidityPack($$$ARGS) → ethers.solidityPacked($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.solidityPack($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.solidityPacked(${args})`));
  }

  // 23. ethers.utils.solidityKeccak256($$$ARGS) → ethers.solidityPackedKeccak256($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.solidityKeccak256($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.solidityPackedKeccak256(${args})`));
  }

  // 24. ethers.utils.soliditySha256($$$ARGS) → ethers.solidityPackedSha256($$$ARGS)
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.soliditySha256($$$ARGS)" } })) {
    const args = node.getMultipleMatches("ARGS").map((n) => n.text()).join(", ");
    edits.push(node.replace(`ethers.solidityPackedSha256(${args})`));
  }

  // 25. ethers.utils.defaultAbiCoder → ethers.AbiCoder.defaultAbiCoder()
  for (const node of rootNode.findAll({ rule: { pattern: "ethers.utils.defaultAbiCoder" } })) {
    edits.push(node.replace(`ethers.AbiCoder.defaultAbiCoder()`));
  }

  if (edits.length === 0) return null;
  return rootNode.commitEdits(edits);
};

export default transform;
