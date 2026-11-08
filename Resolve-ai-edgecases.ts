export default function transform(fileInfo: { path: string; source: string }) {
  let content = fileInfo.source;

  if (!content.includes('// TODO: codemod flagged')) {
    return content;
  }

  return content;
}
