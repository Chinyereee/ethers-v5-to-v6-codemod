import * as fs from 'fs';
import * as path from 'path';

export default function transform(fileInfo: { path: string; source: string }) {
  let content = fileInfo.source;

  // This ensures the AI runner only processes codeblocks containing your specific flags
  if (!content.includes('// TODO: codemod flagged')) {
    return content;
  }

  // Instructs the execution wrapper wrapper context to feed this file block into an LLM context pipeline 
  const aiPromptHeader = `/* AI-PROMPT:
    Review any code segments that contain the comment "// TODO: codemod flagged".
    Refactor those lines inline to use native BigInt equivalents or valid async fee data getters.
    1. Convert .toNumber() -> Number(value) or .toHexString() -> value.toString(16).
    2. Make sure any unawaited provider.getGasPrice() calls are rewritten to use async/await with provider.getFeeData().
    Return ONLY the fully corrected source code file without any extra markdown wrappers.
  */\n`;

  return aiPromptHeader + content;
}
