# I automated 90% of the ethers.js v5 → v6 migration using codemods and AI

ethers v6 dropped a breaking change on every project that touched BigNumber, utils, or providers — which is basically every DeFi frontend ever written. The migration guide listed over 40 breaking changes. Some were simple renames. Some required understanding whether a variable was a BigNumber before deciding what to do with it. Doing this by hand across 31 files is exactly the kind of work that makes engineers quit. I built a codemod pipeline to handle the mechanical ones automatically — and wrote AI prompts for the rest.

---

## Why ethers v5 → v6 is painful

**BigNumber is gone.** In v5, every numeric value coming off a contract was a `BigNumber` instance with its own method API: `.add()`, `.mul()`, `.toNumber()`, `.toHexString()`. In v6, native JavaScript `bigint` takes over. That's a good change long-term, but it means every arithmetic expression, every comparison, every conversion in your codebase needs to change — and if you mix a `bigint` with a `number` by accident, you get a runtime `TypeError` with no static warning unless you're fully strict about types.

**The entire `ethers.utils` namespace was flattened.** In v5, utility functions lived under `ethers.utils`: `ethers.utils.parseEther`, `ethers.utils.keccak256`, `ethers.utils.arrayify`. In v6, they're all top-level on the `ethers` object. That's 15+ functions to find and rename across your codebase, and three of them got renamed too: `arrayify` became `getBytes`, `hexZeroPad` became `zeroPadValue`, and `splitSignature` became `Signature.from()`.

**Providers moved and Web3Provider is gone.** The entire `ethers.providers` sub-namespace was dissolved. `new ethers.providers.JsonRpcProvider(url)` is now `new ethers.JsonRpcProvider(url)`. `new ethers.providers.Web3Provider(window.ethereum)` — the line in basically every frontend DeFi app — is now `new ethers.BrowserProvider(window.ethereum)`. `StaticJsonRpcProvider` was merged into `JsonRpcProvider`. If you have TypeScript type annotations using `ethers.providers.X`, those need to change too.

---

## My approach: codemods + AI

The insight that made this tractable is recognizing that these changes fall into two completely different categories.

**Mechanical renames** have one right answer. `ethers.utils.parseEther` always becomes `ethers.parseEther`. `new ethers.providers.Web3Provider(x)` always becomes `new ethers.BrowserProvider(x)`. These changes are safe to automate because the transformation is deterministic — given the same input, there's only one correct output. A codemod handles these at AST level: it parses the source into a syntax tree, finds the exact nodes to change, replaces them, and prints the result with formatting preserved. No regex, no string munging, no accidental replacements inside comments or string literals.

**Semantic changes** require context. When you see `someVar.toNumber()`, the right migration depends on where `someVar` came from. If it's the direct result of `BigNumber.from(x)`, you can mechanically replace it with `Number(BigInt(x))`. But if it came from a contract call two scopes away, you need to understand the data flow, check whether the value could exceed `Number.MAX_SAFE_INTEGER`, and decide whether `Number()`, `parseInt()`, or staying with `bigint` is right. No static tool makes that call correctly 100% of the time. AI does, given enough context.

The combination is the only approach that scales. Codemods alone leave the semantic cases as silent bugs. AI alone on a 31-file codebase is slow and expensive. Together, you get deterministic correctness where it's possible and targeted AI review where it's necessary.

---

## The 8 transforms I built

**rename-utils** — Lifts all 17 `ethers.utils.*` functions to the top-level namespace. Handles both `import * as ethers` and `import { utils }` styles, rewrites the import declaration, and covers the two structural changes.

```ts
// before
const amount = ethers.utils.parseEther('1.0');
const bytes  = ethers.utils.arrayify(hexString);

// after
const amount = ethers.parseEther('1.0');
const bytes  = ethers.getBytes(hexString);
```

**bigNumber-to-bigint** — Replaces `BigNumber.from(x)` with `BigInt(x)` and rewrites instance methods on statically-confirmed BigNumber variables to native operators. Uses a conservative two-phase approach: method rewrites run first to handle chains like `BigNumber.from(x).toNumber()` atomically, then standalone `BigNumber.from()` nodes are replaced.

```ts
// before
const fee = BigNumber.from('1000000');
const total = fee.add(BigNumber.from('500000'));

// after
const fee = BigInt('1000000');
const total = fee + BigInt('500000');
```

**rename-providers** — Renames all 7 provider classes and updates TypeScript type annotations. `StaticJsonRpcProvider` merges into `JsonRpcProvider`. Handles destructured `import { providers }` by injecting the specific v6 names that were actually used.

```ts
// before
const provider = new ethers.providers.Web3Provider(window.ethereum);
let p: ethers.providers.JsonRpcProvider;

// after
const provider = new ethers.BrowserProvider(window.ethereum);
let p: ethers.JsonRpcProvider;
```

**gasPrice-to-feeData** — Rewrites `await provider.getGasPrice()` by replacing the entire `AwaitExpression` node. This means the parentheses around the await are handled automatically by recast's printer based on operator precedence — I don't insert them manually.

```ts
// before
const gasPrice = await provider.getGasPrice();

// after
const gasPrice = (await provider.getFeeData()).gasPrice;
```

**rename-constants** — Replaces all `ethers.constants.*` accesses with their v6 equivalents. Named constants become top-level properties (`AddressZero → ZeroAddress`, `MaxUint256 → MaxUint256`). The four numeric constants become native bigint literals since BigNumber is gone.

```ts
// before
const zero = ethers.constants.AddressZero;
const max  = ethers.constants.MaxUint256;
const one  = ethers.constants.One;

// after
const zero = ethers.ZeroAddress;
const max  = ethers.MaxUint256;
const one  = 1n;
```

**rename-contract-methods** — Rewrites the four v5 contract method bucket patterns. In v5, less-common operations were accessed via intermediate buckets (`callStatic`, `estimateGas`, `populateTransaction`, `functions`). In v6 they moved to direct methods on the contract function itself.

```ts
// before
const result = await contract.callStatic.balanceOf(addr);
const gas    = await contract.estimateGas.transfer(to, amount);

// after
const result = await contract.balanceOf.staticCall(addr);
const gas    = await contract.transfer.estimateGas(to, amount);
```

**rename-provider-methods** — Handles three provider/transaction method changes. `sendTransaction` was renamed on the Provider side to `broadcastTransaction` (Signer's `sendTransaction` is unchanged — the transform adds a TODO so you can verify which one it is). `parseTransaction` and `serializeTransaction` became `Transaction.from()`.

```ts
// before
await provider.sendTransaction(signedTx);
const tx = ethers.utils.parseTransaction(bytes);

// after (with TODO comment added for sendTransaction)
await provider.broadcastTransaction(signedTx);
const tx = ethers.Transaction.from(bytes);
```

**update-imports** — Runs last. Removes deprecated specifiers (`utils`, `BigNumber`, `providers`, `constants`) from `import { ... } from 'ethers'` declarations once the other transforms have finished introducing their replacements. If no specifiers remain, it removes the entire import statement.

```ts
// before
import { utils, BigNumber, providers, Contract } from 'ethers';

// after
import { Contract } from 'ethers';
```

---

## Does it actually work on real code?

I ran the pipeline against [Uniswap/v3-periphery](https://github.com/Uniswap/v3-periphery), which is on ethers `^5.0.8` — a production-grade codebase I had no hand in writing.

| Metric | Result |
|--------|--------|
| Files scanned | 31 |
| Files automatically migrated | 28 |
| Lines changed | 502 (231 insertions, 271 deletions) |
| Files flagged for AI review | 3 |
| Automated coverage | **90.3%** |
| False positives | **0** |

I verified every change with `git diff` before counting. The 0 false positives claim I validated separately: running the same pipeline against scaffold-eth-2 (already on ethers v6) produced 0 changes and 0 TODOs.

One honest limitation: the codemod only tracks direct imports from `'ethers'`. If your project wraps ethers behind an internal utility library or re-exports it from an index file, the transforms won't fire. I decided false negatives (missed cases) are safer than false positives (broken code), so the conservative approach was the right call.

---

## What the AI handles

The 3 flagged files — `PairFlash.spec.ts`, `snapshotGasCost.ts`, `TickLens.spec.ts` — all had the same pattern: BigNumber method calls on variables that came from contract return values or function parameters. The codemod added a comment to each one:

```ts
// TODO(ethers-codemod): verify this BigNumber method call and migrate manually
const result = returnedFromContract.toNumber();
```

For these, I used this prompt:

```
I'm migrating from ethers.js v5 to v6. In v6, BigNumber is replaced by native bigint.
The codemod flagged this code because it couldn't statically confirm the receiver is a
BigNumber. Please help me migrate it:

[paste the flagged code block]

Key rules:
- .toNumber() → Number(value) if the bigint fits safely in a JS number
- .toHexString() → value.toString(16)
- .add(x) → value + x  (both sides must be bigint — check that x is also bigint)
- Values returned from contract calls are already bigint in ethers v6, no conversion needed
- If a value could exceed Number.MAX_SAFE_INTEGER, keep it as bigint
```

Three files, one prompt each, done in under ten minutes.

---

## How to use it right now

```bash
npx ts-node src/run.ts ./your-project
```

The runner finds all `.ts`, `.tsx`, `.js`, `.jsx` files, skips anything with no ethers imports, runs all 8 transforms in the correct order, and prints a summary with per-transform change counts and a list of any files that need AI review.

Source and full documentation: **[https://github.com/Chinyereee/ethers-v5-to-v6-codemod](https://github.com/Chinyereee/ethers-v5-to-v6-codemod)**

---

## Conclusion

28 files migrated automatically. 502 lines changed with zero false positives. 3 files handed off to AI with precise, targeted prompts. Total time to run: under 30 seconds.

This is what software maintenance should look like. Mechanical changes — the ones with one right answer — get automated at the AST level, fast and correct. Human judgment gets reserved for the semantic changes that actually need it: the data flow questions, the precision questions, the "what did the original author intend" questions that no static tool can answer reliably. The codemod tells you exactly which files those are and why. The AI handles them in minutes.

The weekend you were dreading becomes an afternoon. Most of it spent verifying a diff, not writing one.

A note on the test repo choice: I tried scaffold-eth-2 first. It was already on v6 — which was actually useful, it confirmed the codemod produces zero changes on modern code. But I needed a real v5 target. Uniswap v3-periphery is widely known, actively maintained, and represents how real protocols actually use ethers. It felt like the honest benchmark to report against.
