import type {
  FileInfo,
  API,
  ASTPath,
  CallExpression,
  MemberExpression,
} from 'jscodeshift';

// Maps v5 bucket name → v6 method suffix
// Pattern:  receiver.[bucket].[method](args)
//        →  receiver.[method].[newSuffix](args)
const BUCKET_MAP: Record<string, string> = {
  callStatic: 'staticCall',
  estimateGas: 'estimateGas',         // same name, just moves to suffix position
  populateTransaction: 'populateTransaction', // same name, moves position
  functions: 'staticCallResult',
};

export default function transform(file: FileInfo, api: API): string {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Match: <any>.[bucket].[method](args)
  // where the callee is a 3-level MemberExpression and the middle property
  // is exactly one of the 4 known v5 bucket names.
  //
  // We deliberately do NOT check the receiver identity — the bucket names
  // (callStatic, functions, estimateGas, populateTransaction) are specific
  // enough to the ethers v5 Contract API that matching on them alone is safe.

  root
    .find(j.CallExpression, (node: CallExpression): boolean => {
      const callee = node.callee;
      if (callee.type !== 'MemberExpression') return false;
      const outerMem = callee as MemberExpression;
      if (outerMem.property.type !== 'Identifier') return false;
      if (outerMem.object.type !== 'MemberExpression') return false;
      const innerMem = outerMem.object as MemberExpression;
      return (
        innerMem.property.type === 'Identifier' &&
        (innerMem.property as { name: string }).name in BUCKET_MAP
      );
    })
    .replaceWith((path: ASTPath<CallExpression>) => {
      const outerMem = path.node.callee as MemberExpression;
      const innerMem = outerMem.object as MemberExpression;

      const bucketName = (innerMem.property as { name: string }).name;
      const methodName = (outerMem.property as { name: string }).name;
      const newSuffix = BUCKET_MAP[bucketName];
      const receiver = innerMem.object;

      // Build: receiver.method.newSuffix(args)
      return j.callExpression(
        j.memberExpression(
          j.memberExpression(receiver, j.identifier(methodName)),
          j.identifier(newSuffix)
        ),
        path.node.arguments
      );
    });

  return root.toSource({ quote: 'single' });
}
