# Building transactions manually

The [wallet API](/guide/wallet) covers every operation on this page. Use these primitives, from `@lelantos-org/sdk/protocol`, `@lelantos-org/sdk/primitives`, and `@lelantos-org/sdk/services`, only to build a transaction shape the wallet does not provide.

## Relayer fee output

A relayer fee is a shielded output note addressed to the relayer, included in the transaction it pays for.

The relayer's `GET /chains` response indicates whether it charges. **If `shieldedFee` is present**, every spend and swap on that chain must include a fee output; submissions without one are rejected with `402`.

```ts twoslash
// ---cut-start---
declare const asset: bigint;
// ---cut-end---
import { cryptoContext } from "@lelantos-org/sdk/primitives";
import { feeOutputFromEstimate } from "@lelantos-org/sdk/protocol";
import { RelayerClient } from "@lelantos-org/sdk/services";

const { J } = await cryptoContext();
const relayer = new RelayerClient("https://relayer.lelantos.xyz");
const estimate = await relayer.estimateSpend(8453n, "transfer");

// null when this relayer charges nothing; throws FEE_ASSET_NOT_QUOTED when it
// charges but cannot take `asset` — that spend cannot be relayed at all.
const fee = feeOutputFromEstimate({ J, estimate, asset });
//    ^?
```

### Deposit fee note

A deposit has no proof and no output slots. Its fee is a second leaf next to the depositor's note, built by `buildDeposit` from its `fee` argument. The pool and the flush circuit enforce these rules:

| Rule | Detail |
|---|---|
| Asset | `fee.asset`, defaulting to the deposit asset. The note, its commitment, and `feeCvDep` use that asset, and the request sets `feeAssetId` to it. A different asset must be non-yield-bearing and accepted by the relayer. |
| Zero-value fee | a zero-value note in the deposit asset, with `feeAssetId = 0`. The circuit forces a zero-value leaf's asset to 0; the pool reverts with `FeeAssetMustBeZero` otherwise. |
| Permit | determined by `isSameFeeAsset(feeIn, feeAssetId, publicAssetId)`. If true, sign a single-token `PermitWitnessTransferFrom` with `maxFee = 0`. If false, pass `feeToken` and `maxFee` to `signPermit2Witness`, which signs a `PermitBatchWitnessTransferFrom` over `[deposit token, fee token]` in that order. |

`isSameFeeAsset` compares asset ids, not token addresses: a plain asset and a yield asset can share one ERC-20 and still require two transfers.

`depositTotals` computes the two amounts, `{ principal, relayer }`. See [Computing pulls without a wallet](/guide/fees#computing-pulls-without-a-wallet).

## Output slot order

`buildSpend` takes three parallel arrays — notes, recipients, and randomness. The fee output must be at the same index in all three, and that index must be random: a fee note always in the last slot would identify relayed transactions.

Build one object per slot, shuffle the list once, then split it into the three arrays:

```ts twoslash
// ---cut-start---
import type { FeeOutput, OutputRandomness, OutputRecipient } from "@lelantos-org/sdk/protocol";
import type { Note } from "@lelantos-org/sdk/primitives";
declare const fee: FeeOutput | null;
declare const sendNote: Note;
declare const change: Note[];
declare const payee: OutputRecipient;
declare const own: OutputRecipient;
declare const perOutput: OutputRandomness[];
// ---cut-end---
import { shuffled } from "@lelantos-org/sdk/primitives";

type Slot = { note: Note; recipient: OutputRecipient; randomness: OutputRandomness };

// One object per slot, shuffled once, then unzipped — so the three arrays
// cannot disagree about where the fee went.
const slots: Slot[] = shuffled([
    { note: sendNote, recipient: payee, randomness: perOutput[0]! },
    ...change.map((note, i) => ({ note, recipient: own, randomness: perOutput[i + 1]! })),
    ...(fee ? [fee] : []),
]);

const notes = slots.map((s) => s.note);
const recipients = slots.map((s) => s.recipient);
const randomness = slots.map((s) => s.randomness);
```

The wallet does the same internally, and also records the positions of its own outputs from the same permutation, which is how results report `ownCommitments`.

## Next

- [Fees](/guide/fees)
- [Errors](/guide/errors)
- [API reference](/reference/)
