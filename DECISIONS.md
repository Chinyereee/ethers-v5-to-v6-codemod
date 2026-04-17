# Design Decisions

A dev log of the non-obvious choices made while building this.

## Why jscodeshift over a regex script

Regex breaks on multiline expressions, string contents that look like 
code, and comments. jscodeshift operates on the AST so 
`ethers.utils.parseEther(x)` matches whether it is on one line or 
spread across five. We hit our first regex false positive in the first 
ten minutes of testing and switched.

## Why five separate transforms instead of one

Each transform is independently testable. When the BigNumber transform 
broke `.toNumber()` chains during development, we could isolate and fix 
it without touching provider rename logic. The pipeline order matters — 
update-imports has to run last because the earlier transforms change 
which specifiers are actually used.

## Why two-phase execution in bigNumber-to-bigint

Running method call transforms before `BigNumber.from() → BigInt()` 
means `BigNumber.from(x).toNumber()` becomes `Number(BigInt(x))` in 
one pass. If we ran the from() replacement first, the method calls 
would be left on a BigInt receiver with no handler, producing broken 
output. Ordering was the fix.

## Why we silently skip ambiguous arithmetic chains

`.add()`, `.sub()`, `.mul()` exist on dozens of types — arrays, 
custom classes, anything. Adding a TODO comment on every untracked 
`.add()` call would create hundreds of false positives in any 
moderately complex codebase. We only add TODO comments for 
`.toNumber()` and `.toHexString()` — methods specific enough to 
BigNumber that a missed case is a real bug worth flagging.

## Why we tested on Uniswap v3-periphery specifically

We tried scaffold-eth-2 first. It had already migrated to v6 — which 
proved useful (zero false positives on modern code) but useless for 
measuring coverage. We needed a real v5 target that was large enough 
to be meaningful, maintained enough to be representative, and 
well-known enough that judges would recognize it. Uniswap v3-periphery 
fit all three. We checked the diff by hand before reporting the numbers.

## What we deliberately left out

Event filter migration. The v6 event API changed fundamentally — it is 
not a rename, it is a different programming model. Automating it would 
require understanding the semantics of each filter, not just its syntax. 
That is the kind of thing that causes false positives. We documented the 
AI prompt for it instead.

## What we would build next

A transform for `provider.getSigner()` becoming async is the most 
tractable next step — it is a mechanical change (add await, mark 
containing function async) that jscodeshift can handle with some 
call-graph awareness. Event filters would follow, scoped to the common 
patterns only.
