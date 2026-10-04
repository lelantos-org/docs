# Transfer

A transfer moves value between shielded addresses. It spends the sender's notes and creates new notes for the payee, the change, and the relayer fee if one is charged. No public balance changes, and no amount is published.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const peer: string;
// ---cut-end---
const tx = await wallet.transfer({
    asset: "USDC", // id, token address or symbol
    amount: "25", // the recipient note's value — see Amounts
    recipient: peer, // bech32m `lelantos1…` address
    feeAsset: "USDC", // optional — pay the relayer in another asset
    autoConsolidate: true, // optional — merge notes and retry when no cover exists
    selection: { dustThreshold: 10n }, // optional — coin-selection rules
    onPhase: (phase) => console.log(phase), // "preparing" | "consolidating" | "proving" | "submitting" | "confirmed"
});

tx.recipientCommitment;
// ^?
```

| Option | Description |
|---|---|
| `asset` | registry id, token address, or symbol |
| `amount` | the recipient note's value: a decimal string, an SDK-returned amount, or `{ baseUnits }` |
| `recipient` | recipient shielded address |
| `feeAsset` | pay the relayer fee in another asset — see [Fees](/guide/fees#paying-the-fee-in-a-different-asset) |
| `maxFee` | cap on the relayer fee, in the fee asset — see [Fees](/guide/fees#limiting-the-relayer-fee) |
| `autoConsolidate` | on `INSUFFICIENT_COVER`, merge notes with a self-transfer and retry once. Default `false` |
| `selection` | coin-selection rules (`dustThreshold`, `cooldownBlocks`, `maxInputs`, `only`, …) — see [Note management](/guide/notes#selection-rules) |
| `deadline` | unix seconds; checked before submitting, else `DEADLINE_PASSED` |
| `signal`, `onPhase`, `opId` | cancellation, progress, and a correlation id — see [Errors](/guide/errors#operation-ids-and-cancellation) |

`"proving"` is CPU-bound and takes seconds. Show it as a distinct state in a UI. See [Benchmarks](/guide/benchmarks) for timings. `"confirmed"` arrives when the relayer answers, which it does once the transaction is mined.

## Reading the result

| Field | Meaning |
|---|---|
| `amount` | the payee note's value (`Money`) |
| `recipient` | the payee |
| `recipientCommitment` | the payee note's commitment |
| `fees.relayer` | the relayer fee note (`Money` in the fee asset), or `null` for a free relay |
| `fees.protocol` | always `null`: transfers pay no protocol fee |
| `ownCommitments` | outputs this wallet will recover: change, plus the payee note on a self-transfer |
| `nonZeroCommitments` | outputs with a non-zero value; the rest are padding |
| `spent` | ids of the consumed notes, across both assets when the fee was cross-asset |
| `change` | change left in `asset`, circuit units |
| `txHash`, `operation` | the relayer's transaction, and where this operation sits in it when bundled |

::: warning Use `recipientCommitment`, not `commitments[0]`
Output order is randomized so observers cannot tell which output is the payment. `commitments[0]` is not the payee's note.
:::

Sharing `recipientCommitment` with the payee reveals nothing new; the payee finds the same note when syncing, and can wait for it with `awaitCommitments([cm])`.

## Proving a payment

A transfer is private to everyone but its two parties, so a sender in a dispute has nothing to show. `paymentProof` produces the secret behind one output; with the payee's address, its holder reads that output's asset and value from the chain.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
// ---cut-end---
const paid = await wallet.transfer({ asset: "USDC", amount: "25", recipient });

const proof = await wallet.paymentProof({
    txHash: paid.txHash,
    commitment: paid.recipientCommitment,
});
// `proof` is plain JSON: send it to whoever asked.
```

The verifier needs no key, only the payee's address and an RPC:

```ts twoslash
// ---cut-start---
import type { PaymentProof } from "@lelantos-org/sdk";
import type { ChainReader } from "@lelantos-org/sdk/advanced";
declare const proof: PaymentProof;
declare const payeeAddress: string;
declare const reader: ChainReader;
// ---cut-end---
import { verifyPaymentProof } from "@lelantos-org/sdk/protocol";

// `reader` is any chain layer that reads logs, such as a wallet's `chain`.
const result = await verifyPaymentProof({ proof, recipient: payeeAddress, reader });
if (result.ok) console.log(result.asset, result.value); // circuit units
else console.log(result.reason);
```

| `reason` | Meaning |
|---|---|
| `malformed` | not a version-1 proof |
| `wrong-chain` | made for another chain than the reader's |
| `not-published` | the pool published no such commitment in that transaction |
| `wrong-ephemeral` | the secret is not that output's |
| `not-for-recipient` | the output was not encrypted to this address |
| `commitment-mismatch` | it opens, but not to the note the pool committed to |

A proof opens one output and nothing else: not the spend's other outputs or inputs, not other payments by either party, and it neither spends the note nor shows when it is spent. The payee cannot forge one.

The secret is derived from the wallet's seed and the published output, so nothing has to be stored: a wallet restored elsewhere produces the same proof from `txHash` and `commitment`. For an output made by another wallet, or by an SDK that predates this derivation, `paymentProof` rejects `INVALID_ARGUMENT`.

## Claim-link keys

To pay someone who has no wallet yet, fund a fresh account and hand over its key. `claimLinkKey(index)` derives that account from the wallet's own key, so an unclaimed link can be recomputed and swept back from any device:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const index: number;
// ---cut-end---
const link = await wallet.claimLinkKey(index);

await wallet.transfer({ asset: "USDC", amount: "25", recipient: link.address });
// Hand `link.nsk` to the payee: `connect({ nsk })` over it spends the note.
```

::: danger One index, one link
Two links from one index share a key, so the holder of the first can take the second. Use the first index whose account has never held a note, and check that against the chain rather than a local counter: another device on the same seed may be ahead.
:::

The key is specific to the chain. Indices are unlinkable to each other and to the wallet's address.

## When the notes do not fit

A spend consumes at most `nIn` notes (four with the default circuit). The four funding errors say why a spend could not be funded, and each has its own remedy:

| Code | Cause | Remedy |
|---|---|---|
| `INSUFFICIENT_BALANCE` | the unspent notes do not add up to the amount plus a same-asset fee | send less, or top up |
| `NOTES_HELD` | they would, but some are reserved by another spend, cooling down, or dust | `retryable: true` means waiting frees enough |
| `INSUFFICIENT_COVER` | they add up, but no combination fits the input slots | consolidate |
| `FEE_ASSET_NOT_QUOTED` | the relayer does not accept `feeAsset` | pick one of `accepted` |
| `FEE_ABOVE_LIMIT` | the relayer's quote exceeds `maxFee` or `acceptRelayerFee` | retry, or raise the limit |

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer({ asset: "USDC", amount: "25", recipient });
} catch (err) {
    if (isWalletError(err, "INSUFFICIENT_COVER")) {
        // `err.consolidate` names the notes to merge; `consolidationAttempted` says whether
        // `autoConsolidate` already tried.
        console.log(err.consolidate.map((n) => n.id), err.consolidateSum, err.consolidationAttempted);
    } else if (isWalletError(err, "INSUFFICIENT_BALANCE")) {
        console.log("have", err.available, "need", err.required);
    } else {
        throw err;
    }
}
```

To avoid `INSUFFICIENT_COVER`:

| Approach | Behaviour |
|---|---|
| `autoConsolidate: true` | the wallet merges the notes named by the selector, then retries. Costs one extra proof and transaction. Phases report `"consolidating"`. |
| manual consolidation | catch the error and merge the notes yourself, to show progress in a UI. See [Consolidating explicitly](/guide/notes#consolidating-explicitly). |
| `spendableMax()` | size the transfer to what one spend can reach, so the error does not occur. See [What a single spend can reach](/guide/notes#what-a-single-spend-can-reach). |

## Concurrent spends

Each spend leases the notes it selects until it settles, so two spends started at once never select the same note. The second one selects from what is left, or rejects `NOTES_HELD` (retryable) when the leased notes were needed.

## Next

- [Withdraw](/guide/withdraw)
- [Fees](/guide/fees)
- [Note management](/guide/notes)
