const bn = BigInt('100');
const bn2 = BigInt(42);
const chained = Number(BigInt(value));
const hexStr = BigInt('255').toString(16);

const a = BigInt('10');
const b = BigInt('20');
const sum = a + b;
const diff = a - b;
const product = a * b;
const quotient = a / b;
const isEqual = a === b;
const isGt = a > b;
const isGte = a >= b;
const isLt = a < b;
const isLte = a <= b;

// TODO(ethers-codemod): verify this BigNumber method call and migrate manually
const untracked = unknownBigNumber.toNumber();
