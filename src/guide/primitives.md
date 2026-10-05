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
| Asset | `fee.asset`, defaulting to the deposit asset. The note and its commitment use that asset, and the request sets `feeAssetId` to it. A different asset must be non-yield-bearing and accepted by the relayer. |
| Zero-value fee | a zero-value note naming asset 0, with `feeAssetId = 0`. The circuit hashes `feeAssetId` into the leaf, so the note must carry the same id; the pool reverts with `FeeAssetMustBeZero` for any other id on a zero-value leaf. |
| Permit | determined by `isSameFeeAsset(feeIn, feeAssetId, publicAssetId)`. If true, sign a single-token `PermitWitnessTransferFrom` with `maxFee = 0`. If false, pass `feeToken` and `maxFee` to `signPermit2Witness`, which signs a `PermitBatchWitnessTransferFrom` over `[deposit token, fee token]` in that order. |

`isSameFeeAsset` compares asset ids, not token addresses: a plain asset and a yield asset can share one ERC-20 and still require two transfers.

`depositTotals` computes the two amounts, `{ principal, relayer }`. See [Computing pulls without a wallet](/guide/fees#computing-pulls-without-a-wallet).

## Output slot order

`buildSpend` takes one `outputs` array with an entry per slot: `{ asset, value, recipient }`, where `recipient` is a decoded shielded address. The fee output's index must be random: a fee note always in the last slot would identify relayed transactions.

Build the list, then shuffle it once:

```ts twoslash
// ---cut-start---
import type { FeeOutput, OutputRecipient } from "@lelantos-org/sdk/protocol";
declare const fee: FeeOutput | null;
declare const asset: bigint;
declare const sendValue: bigint;
declare const changeValues: bigint[];
declare const payee: OutputRecipient;
declare const own: OutputRecipient;
// ---cut-end---
import { shuffled } from "@lelantos-org/sdk/primitives";
import type { OutputSpec } from "@lelantos-org/sdk/protocol";

// A fee output is an OutputSpec like any other, so one shuffle places it.
const outputs: OutputSpec[] = shuffled([
    { asset, value: sendValue, recipient: payee },
    ...changeValues.map((value) => ({ asset, value, recipient: own })),
    ...(fee ? [fee] : []),
]);
```

Shuffle before calling `buildSpend`, and do not reorder afterwards: each output's `rho` is derived from its final index.

The wallet does the same internally, and also records the positions of its own outputs from the same permutation, which is how results report `ownCommitments`.

## Output randomness

`buildSpend` and `buildDeposit` draw no randomness for an output. Both take `outgoingKey`, from `deriveOutgoingKey(nsk)` in `@lelantos-org/sdk/primitives`, and derive every output's commitment blinder, ECDH ephemeral, and clue blinder from it, the output's own fields, the recipient's address, and, in a spend, the spend's nullifiers. The sender can therefore recompute them later, which is what a [payment proof](/guide/transfer#proving-a-payment) does.

| Builder | `rho` of each output |
|---|---|
| `buildSpend` | `Poseidon(TAG_RHO, nullifiers[0], index)`; nothing to supply |
| `buildDeposit` | `deriveDepositRho(outgoingKey, rhoNonce)`; supply one `rhoNonce` per leaf, 32 random bytes, fresh per deposit and distinct between the two leaves |

::: danger The outgoing key is a viewing key for what was sent
With a payee's address, its holder can open every note the account sent to that payee. It grants no spend authority and reveals nothing about incoming notes.
:::

`sealOutput`, in `@lelantos-org/sdk/protocol`, seals a single output the same way, for code that assembles a bundle itself.

## Next

- [Fees](/guide/fees)
- [Errors](/guide/errors)
- [API reference](/reference/)
