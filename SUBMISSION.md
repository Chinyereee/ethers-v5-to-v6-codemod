# ethers/5-to-6

Built this after watching our team spend days manually migrating a v5 
codebase line by line. There had to be a better way than ctrl+F and pray.

## What it does

Five jscodeshift transforms that handle the mechanical parts of the 
ethers v5 → v6 migration automatically — the stuff you'd otherwise 
do by hand across every file:

- `ethers.utils.*` → flattened v6 equivalents (17 renames, including 
  arrayify→getBytes and hexZeroPad→zeroPadValue which catch people out)
- `ethers.BigNumber.from()` → native `BigInt()` with method chain 
  handling — .add(), .sub(), .mul(), chained arithmetic, the works
- `ethers.providers.*` → v6 provider names (Web3Provider became 
  BrowserProvider, StaticJsonRpcProvider merged into JsonRpcProvider)
- `provider.getGasPrice()` → `(await provider.getFeeData()).gasPrice` 
  with correct parenthesisation that recast handles automatically
- Import cleanup — strips utils, BigNumber, providers from specifiers 
  after the other transforms have run

The transforms are ordered. They run as a pipeline. Each one sees the 
output of the previous. That matters for cases like 
`BigNumber.from(x).toNumber()` which needs to become `Number(BigInt(x))` 
atomically, not in two broken half-steps.

## Tested on Uniswap v3-periphery

Cloned the repo. Ran the codemod. Checked every line of the diff.

- 31 files contained ethers imports
- 15 migrated automatically  
- 3 flagged for manual review — BigNumber method chains on variables 
  we couldn't statically type-track
- 153 lines changed (76 insertions, 77 deletions)
- 0 incorrect changes

Coverage: 83.3%. The 3 flagged files are genuine edge cases, not 
failures — we'd rather add a TODO comment than silently corrupt code.

We tried scaffold-eth-2 first. It was already on v6. That turned out 
useful — proved the codemod is a no-op on modern code and doesn't 
introduce false positives. But we needed a real v5 target. Uniswap 
felt like the honest benchmark.

## What's left for AI

Three categories the codemod intentionally leaves for human + AI review:

1. BigNumber method chains on untracked variables — we can't safely 
   infer the type without interprocedural analysis
2. Event filters — the v6 API was completely reworked, not just renamed
3. `provider.getSigner()` — now async in v6, needs await added in callers

The README has exact copy-paste prompts for each one.

## One limitation worth knowing

The codemod only tracks direct imports from `'ethers'`. If your codebase 
wraps ethers behind an internal library or re-exports it, the transforms 
won't fire. That's a deliberate tradeoff — false positives are worse 
than missed cases.

## Tests

100 tests across 5 suites. Every transform has fixture-based tests with 
real input/output pairs. Run with `npm test`.

## How to run

npx ts-node src/run.ts ./your-project

## Links
- GitHub: https://github.com/Chinyereee/ethers-v5-to-v6-codemod
- Case study: (add Dev.to link after publishing)
