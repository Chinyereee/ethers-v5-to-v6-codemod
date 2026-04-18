# ethers.js v5 → v6 Codemod

![npm version](https://img.shields.io/badge/npm-1.0.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![tests](https://img.shields.io/badge/tests-100%20passing-brightgreen)

An automated jscodeshift codemod that migrates ethers.js v5 codebases to v6. Run it once, get a clean diff, review the flagged edge cases with AI.

---

## What this automates

| Pattern | v5 | v6 | Status |
|---------|----|----|--------|
| Utils namespace — parseEther | `ethers.utils.parseEther(v)` | `ethers.parseEther(v)` | ✅ Automated |
| Utils namespace — formatEther | `ethers.utils.formatEther(v)` | `ethers.formatEther(v)` | ✅ Automated |
| Utils namespace — parseUnits | `ethers.utils.parseUnits(v, d)` | `ethers.parseUnits(v, d)` | ✅ Automated |
| Utils namespace — formatUnits | `ethers.utils.formatUnits(v, d)` | `ethers.formatUnits(v, d)` | ✅ Automated |
| Utils namespace — keccak256 | `ethers.utils.keccak256(data)` | `ethers.keccak256(data)` | ✅ Automated |
| Utils namespace — sha256 | `ethers.utils.sha256(data)` | `ethers.sha256(data)` | ✅ Automated |
| Utils namespace — toUtf8Bytes | `ethers.utils.toUtf8Bytes(s)` | `ethers.toUtf8Bytes(s)` | ✅ Automated |
| Utils namespace — toUtf8String | `ethers.utils.toUtf8String(b)` | `ethers.toUtf8String(b)` | ✅ Automated |
| Utils namespace — hexlify | `ethers.utils.hexlify(b)` | `ethers.hexlify(b)` | ✅ Automated |
| Utils namespace — isAddress | `ethers.utils.isAddress(a)` | `ethers.isAddress(a)` | ✅ Automated |
| Utils namespace — getAddress | `ethers.utils.getAddress(a)` | `ethers.getAddress(a)` | ✅ Automated |
| Utils namespace — id | `ethers.utils.id(s)` | `ethers.id(s)` | ✅ Automated |
| Utils rename — arrayify | `ethers.utils.arrayify(hex)` | `ethers.getBytes(hex)` | ✅ Automated |
| Utils rename — hexZeroPad | `ethers.utils.hexZeroPad(v, n)` | `ethers.zeroPadValue(v, n)` | ✅ Automated |
| Utils rename — zeroPad | `ethers.utils.zeroPad(arr, n)` | `ethers.zeroPadBytes(arr, n)` | ✅ Automated |
| Utils special — splitSignature | `ethers.utils.splitSignature(sig)` | `ethers.Signature.from(sig)` | ✅ Automated |
| Utils special — defaultAbiCoder | `ethers.utils.defaultAbiCoder` | `ethers.AbiCoder.defaultAbiCoder()` | ✅ Automated |
| Destructured utils — all 17 above | `import { utils } from 'ethers'; utils.parseEther(v)` | `import { ethers } from 'ethers'; ethers.parseEther(v)` | ✅ Automated |
| BigNumber — construction | `BigNumber.from(x)` | `BigInt(x)` | ✅ Automated |
| BigNumber — construction namespace | `ethers.BigNumber.from(x)` | `BigInt(x)` | ✅ Automated |
| BigNumber — toNumber() on tracked var | `bn.toNumber()` | `Number(bn)` | ✅ Automated |
| BigNumber — toHexString() on tracked var | `bn.toHexString()` | `bn.toString(16)` | ✅ Automated |
| BigNumber — arithmetic on tracked var | `bn.add(x)` / `bn.sub(x)` / `bn.mul(x)` / `bn.div(x)` | `bn + x` / `bn - x` / `bn * x` / `bn / x` | ✅ Automated |
| BigNumber — comparisons on tracked var | `bn.gt(x)` / `bn.gte(x)` / `bn.lt(x)` / `bn.lte(x)` / `bn.eq(x)` | `bn > x` / `bn >= x` / `bn < x` / `bn <= x` / `bn === x` | ✅ Automated |
| BigNumber — remove import specifier | `import { BigNumber } from 'ethers'` | _(removed)_ | ✅ Automated |
| BigNumber — toNumber() untracked | `contractReturn.toNumber()` | _(flagged)_ | ⚠️ AI-assisted |
| BigNumber — toHexString() untracked | `contractReturn.toHexString()` | _(flagged)_ | ⚠️ AI-assisted |
| Provider rename — Web3Provider | `new ethers.providers.Web3Provider(w)` | `new ethers.BrowserProvider(w)` | ✅ Automated |
| Provider rename — JsonRpcProvider | `new ethers.providers.JsonRpcProvider(url)` | `new ethers.JsonRpcProvider(url)` | ✅ Automated |
| Provider rename — WebSocketProvider | `new ethers.providers.WebSocketProvider(url)` | `new ethers.WebSocketProvider(url)` | ✅ Automated |
| Provider rename — FallbackProvider | `new ethers.providers.FallbackProvider([a, b])` | `new ethers.FallbackProvider([a, b])` | ✅ Automated |
| Provider merge — StaticJsonRpcProvider | `new ethers.providers.StaticJsonRpcProvider(url)` | `new ethers.JsonRpcProvider(url)` | ✅ Automated |
| Provider rename — AlchemyProvider | `new ethers.providers.AlchemyProvider(net, key)` | `new ethers.AlchemyProvider(net, key)` | ✅ Automated |
| Provider rename — InfuraProvider | `new ethers.providers.InfuraProvider(net, id)` | `new ethers.InfuraProvider(net, id)` | ✅ Automated |
| Provider type annotations — all 7 above | `let p: ethers.providers.Web3Provider` | `let p: ethers.BrowserProvider` | ✅ Automated |
| Provider destructured — new + types | `import { providers }; new providers.Web3Provider(w)` | `import { BrowserProvider }; new BrowserProvider(w)` | ✅ Automated |
| Gas price — awaited | `await provider.getGasPrice()` | `(await provider.getFeeData()).gasPrice` | ✅ Automated |
| Gas price — FeeData type | `ethers.providers.FeeData` | `ethers.FeeData` | ✅ Automated |
| Gas price — non-awaited | `provider.getGasPrice().then(...)` | _(flagged)_ | ⚠️ AI-assisted |
| Import cleanup — utils | `import { utils } from 'ethers'` | _(removed)_ | ✅ Automated |
| Import cleanup — BigNumber | `import { BigNumber } from 'ethers'` | _(removed)_ | ✅ Automated |
| Import cleanup — providers | `import { providers } from 'ethers'` | _(removed)_ | ✅ Automated |
| Event filters | `contract.filters.Transfer(from, to)` | `contract.filters.Transfer(from, to)` _(API reworked)_ | ❌ Manual |
| Error handling | `error.data` / `Logger.errors` | `error.info` / `ethers.errors` | ❌ Manual |
| Signer async | `provider.getSigner()` | `await provider.getSigner()` | ❌ Manual |

---

## Real-world results

Tested against Uniswap v3-periphery (ethers `^5.0.8`) — a production-grade codebase with 16,000+ lines across 50+ TypeScript files.

| Metric | Result |
|--------|--------|
| Repository | [Uniswap/v3-periphery](https://github.com/Uniswap/v3-periphery) |
| Ethers files scanned | 31 |
| Files automatically migrated | 15 |
| Files needing AI review | 3 |
| Automated coverage | **83.3%** |
| False positives | **0** |
| Lines changed | 153 (76 insertions, 77 deletions) |

Zero-false-positive claim validated separately by running against scaffold-eth-2 (already on ethers v6): 0 files changed, 0 TODOs.

---

## Quickstart

```bash
# Option 1: via codemod registry
npx codemod @chinyereee/ethers-v5-to-v6 ./your-project

# Option 2: directly
npx ts-node src/run.ts ./your-project
```

The runner will:
1. Recursively find all `.ts`, `.tsx`, `.js`, `.jsx` files
2. Skip files with no ethers imports (no false positives on unrelated code)
3. Run all 5 transforms in the correct dependency order
4. Print a colorized summary with per-transform change counts
5. List any files flagged with TODO comments for AI-assisted review

---

## AI-Assisted Edge Cases

For the patterns the codemod flags with `TODO` comments, paste the relevant file content into Claude or ChatGPT along with one of these prompts.

### 1. BigNumber method chains on untracked variables

Use when the codemod flagged `.toNumber()` or `.toHexString()` on a variable it couldn't statically confirm came from `BigNumber.from()` — e.g. values returned from contracts, function parameters, or cross-scope assignments.

```
I'm migrating from ethers.js v5 to v6. In v6, BigNumber is replaced by native bigint.

The codemod flagged this code because it couldn't statically confirm the receiver is a
BigNumber. Please help me migrate it:

[paste the flagged code block here]

For context:
- .toNumber() → Number(value) if the bigint fits safely, otherwise use parseInt or a manual check
- .toHexString() → value.toString(16)
- .add(x) → value + x  (both sides must be bigint — check that x is also bigint)
- .mul(x) → value * x
- BigNumber.from(x) → BigInt(x)  where x can be string, number, or hex

Make sure both sides of arithmetic operations are bigint — mixing bigint with number throws
a TypeError at runtime in JavaScript. If a value comes from a contract call, it's already
bigint in ethers v6 (no conversion needed).
```

### 2. Non-awaited getGasPrice() calls

Use when `provider.getGasPrice()` appears without `await` — usually inside `.then()` chains or Promise combinators.

```
I'm migrating from ethers.js v5 to v6. The method getGasPrice() was removed in v6.
The replacement is getFeeData(), which returns a FeeData object with .gasPrice,
.maxFeePerGas, and .maxPriorityFeePerGas.

The codemod handled awaited calls automatically. Please help me migrate these non-awaited
usages (they appear inside .then() chains or Promise.all):

[paste the flagged code block here]

In v6:
- provider.getGasPrice() → provider.getFeeData().then(f => f.gasPrice)
- Promise.all([..., provider.getGasPrice()]) → Promise.all([..., provider.getFeeData().then(f => f.gasPrice)])
- For EIP-1559 transactions, prefer f.maxFeePerGas over f.gasPrice

Rewrite the Promise chain to use getFeeData() and extract the field that best matches
the original intent.
```

### 3. Event filter API

The event filter system was significantly reworked in ethers v6. This requires manual migration.

```
I'm migrating from ethers.js v5 to v6. The contract event filter API changed substantially.

In v5:
  contract.filters.Transfer(from, to)        // returns a Filter object
  provider.getLogs(filter)
  contract.queryFilter(contract.filters.Transfer())

In v6:
  contract.filters.Transfer(from, to)        // still works for simple cases
  contract.queryFilter('Transfer', fromBlock, toBlock)
  contract.getEvent('Transfer')              // new: direct event descriptor

Please help me migrate this event-handling code:

[paste the event filter code here]

Pay special attention to:
- Typed event filters: in v6, use contract.getEvent('EventName') for fully-typed results
- Topic encoding: ethers.utils.id() → ethers.id() (already handled by the codemod)
- Provider.getLogs() still works but the filter shape changed slightly
```

### 4. Signer async changes

`provider.getSigner()` is now async in ethers v6 and must be awaited.

```
I'm migrating from ethers.js v5 to v6. In v6, provider.getSigner() is now async and
must be awaited. Also, JsonRpcSigner.provider is now always defined (no longer optional).

Please help me migrate this signer-related code:

[paste the signer code here]

Key changes:
- provider.getSigner() → await provider.getSigner()
- provider.getSigner(index) → await provider.getSigner(index)
- If this is inside a non-async function, the function signature needs to become async
- signer.provider → signer.provider (no longer optional — remove null checks if present)
- Signer.connect(provider) was removed — signers are now bound at construction time

Make sure every call site that calls .getSigner() is inside an async context after the change.
```

### 5. Error handling

ethers v6 changed error types, properties, and the Logger API.

```
I'm migrating from ethers.js v5 to v6. The error handling API changed significantly.

In v5:
  import { Logger } from '@ethersproject/logger'
  Logger.errors.CALL_EXCEPTION  // error code constants
  error.data                    // revert data on CALL_EXCEPTION errors
  error.reason                  // human-readable revert reason

In v6:
  ethers.errors                 // error code enum (no separate Logger import)
  error.info                    // replaces error.data for supplemental info
  error.shortMessage            // concise error description (new)
  ethers.isCallException(error) // type guard for call exceptions
  error.revert                  // decoded revert data (new)

Please help me migrate this error-handling code:

[paste the error handling code here]

Focus on:
1. Replacing Logger.errors.X with ethers.errors.X or the string literal equivalent
2. Replacing error.data with error.info or error.revert depending on usage
3. Using ethers.isCallException(error) instead of error.code === 'CALL_EXCEPTION'
4. Any try/catch blocks around contract calls that inspect the error shape
```

---

## How it works

### `rename-utils` — 17 patterns

Detects whether the file uses `import * as ethers` (namespace) or `import { utils } from 'ethers'` (destructured) and rewrites all `ethers.utils.X(...)` or `utils.X(...)` calls to their v6 equivalents. Fifteen patterns are simple name promotions (e.g. `parseEther` stays `parseEther`, just moves up one level). Two are renames (`arrayify → getBytes`, `hexZeroPad → zeroPadValue`, `zeroPad → zeroPadBytes`). Two are structural transformations: `splitSignature(x)` becomes `Signature.from(x)`, and the property access `defaultAbiCoder` becomes a method call `AbiCoder.defaultAbiCoder()`. For destructured usage, the transform rewrites the import declaration — removing `utils` and adding `ethers` — then rewrites all call sites.

### `bigNumber-to-bigint` — conservative static analysis

Replaces `BigNumber.from(x)` with `BigInt(x)` and migrates instance methods to native operators and built-ins. To avoid false positives, the transform first builds a `knownBigNumbers` set by scanning all `VariableDeclarator` and `AssignmentExpression` nodes for direct `BigNumber.from()` assignments. Method calls (`.add()`, `.toNumber()`, etc.) are only automatically transformed when the receiver is in this set or is a direct `BigNumber.from()` call. For `.toNumber()` and `.toHexString()` on untracked receivers, a TODO comment is inserted. Generic arithmetic methods (`.add()`, `.sub()`, etc.) on untracked receivers are silently skipped — they're too common outside BigNumber contexts to flag safely. The transform runs in two phases: method rewrites first (to handle chained calls like `BigNumber.from(x).toNumber()` atomically), then standalone `BigNumber.from()` replacement.

### `rename-providers` — 7 providers + type annotations

Maps all 7 `ethers.providers.*` provider classes to their v6 equivalents. The key rename is `Web3Provider → BrowserProvider`; `StaticJsonRpcProvider` merges into `JsonRpcProvider`. Beyond `new` expressions, the transform also rewrites TypeScript type annotations (`TSTypeReference` nodes) in variable declarations, function parameters, return types, and `as` casts — covering both the `ethers.providers.X` qualified form and the bare `providers.X` destructured form. For destructured imports, it tracks which v6 names were introduced and updates the import declaration accordingly, deduplicating if a v6 name was already present.

### `gasPrice-to-feeData` — await-aware rewrite

Replaces `await provider.getGasPrice()` with `(await provider.getFeeData()).gasPrice`. The transform targets the `AwaitExpression` node rather than the inner `CallExpression` so the result slots naturally into any expression context — variable declarations, object literals, ternaries, etc. Recast's printer automatically adds the wrapping parentheses because `AwaitExpression` has lower precedence than `MemberExpression`. Non-awaited `getGasPrice()` calls (Promise chains, fire-and-forget) are flagged with a TODO comment rather than transformed, since their async context needs human judgment. The transform also migrates `ethers.providers.FeeData` type annotations to `ethers.FeeData`.

### `update-imports` — cleanup pass

Removes deprecated v5 import specifiers (`utils`, `BigNumber`, `providers`) from `import { ... } from 'ethers'` declarations. Namespace imports (`import * as ethers`) and default imports (`import ethers`) are always preserved unchanged. If removing deprecated specifiers leaves an import declaration with zero specifiers, the entire import statement is removed. This transform runs last so the earlier transforms have already finished introducing replacement names — making this pass purely a cleanup step with no risk of removing something that's still needed.

---

## Transform pipeline order

```
rename-utils
     │
     ▼
bigNumber-to-bigint
     │
     ▼
rename-providers
     │
     ▼
gasPrice-to-feeData
     │
     ▼
update-imports
```

Order matters: `bigNumber-to-bigint` must run before `update-imports` (which removes the `BigNumber` import), and `rename-utils`/`rename-providers` must run before `update-imports` (which removes the `utils`/`providers` imports). Running `update-imports` last ensures it only removes specifiers that are genuinely no longer needed.

---

## Testing

```bash
npm test
```

100 tests across 5 suites — one suite per transform. Tests cover:

- All named patterns (inline unit tests per transform)
- Namespace import style (`import * as ethers`)
- Destructured import style (`import { utils }`, `import { providers }`, `import { BigNumber }`)
- TypeScript type annotations
- Import declaration rewriting and deduplication
- Edge cases: non-ethers imports untouched, idempotency (running twice = same result), files with no ethers import
- Fixture-based integration tests using full input/output `.ts` files in `tests/fixtures/`

---

## Contributing

To add a new transform:

1. **Create `src/transforms/your-transform-name.ts`** — export a default jscodeshift `Transform` function. Use `root.toSource({ quote: 'single' })` as the return value. Follow the existing pattern: detect import style first, then walk the AST, then update imports last.

2. **Add it to the pipeline in `src/transforms/index.ts`** and `src/run.ts` (the `PIPELINE` array). Place it before `update-imports`, and consider whether it needs to run before or after `bigNumber-to-bigint` based on whether it touches the same nodes.

3. **Write tests in `tests/your-transform-name.test.ts`** — cover both namespace and destructured import styles, at least one fixture file in `tests/fixtures/your-transform-name/`, and an idempotency test. Run `npm test` to confirm all 100 existing tests still pass.

---

## License

MIT
