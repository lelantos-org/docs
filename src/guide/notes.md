# Note management

The pool stores notes, not balances. This page covers reading the local note cache, computing the maximum amount one spend can send, the selection rules, and consolidating notes.

## Reading notes

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const all = await wallet.notes(); // every note, every asset
const unspentUsdc = await wallet.notes({ asset: 1n, spent: false }); // both fields optional
//    ^?
```

`notes()` reads the local cache as of the last sync; it makes no request. For totals, use [`balance(asset)`](/guide/state#balance) or `state().balances`.

`WalletNote` is the public note view: `id`, `asset`, `value`, `spent`, `cm`, `firstSeenBlock`, `discoveredAt`. For the fields custom proofs need, `note.notePayload()` returns `{ asset, value, rho, rcm, rcvDep }`.

## What a single spend can reach

`balance().total` is not the maximum sendable amount. A "max" button based on it can fail with `INSUFFICIENT_COVER` or `NOTES_HELD`.

`spendableMax(asset, options)` applies the same rules as the spend and reports why the rest of the balance is excluded:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

const weth = await wallet.asset("WETH");
const { max, withheld } = await wallet.spendableMax(weth.id, { kind: "transfer" });

console.log("send at most", formatAmount(max, weth, { symbol: true }));
console.log(withheld); // { reserved, cooldown, dust, slots }
```

| Option | Effect |
|---|---|
| `kind` | reserve the relayer fee for this operation: subtracted from `max` when paid in `asset`, one input slot when paid in another. Omitted: nothing is reserved |
| `feeAsset` | with `kind`: the asset the spend will pay the fee in; default `asset` |
| `native` | with `kind: "withdraw"`: price the native-unwrap estimate |
| `selection` | the same selection rules the spend will use |

`max` is the largest transfer `amount`, or withdrawal or swap `gross`, that one spend can cover. Pass the same options the operation will use, and the two agree.

## Selection rules

Every spend accepts `selection`, and `spendableMax` accepts the same object, so a predicted maximum and the spend agree.

| Field | Default | Effect |
|---|---|---|
| `dustThreshold` | `0n` | exclude notes below this value; roughly twice the marginal fee is a good start |
| `cooldownBlocks` | `1` | minimum note age in blocks; needs a chain layer that reports `blockNumber` |
| `maxInputs` | the circuit's `nIn` | notes one spend may consume; values above `nIn` are capped |
| `bucketPct` | `0.05` | tiebreak shuffle width |
| `only` | — | restrict candidates to these note ids |

The SDK supplies the fee threshold and the chain tip itself, so they are not options.

The default selector is **SFRT** (Smallest-First, Random Tiebreak). Compared with largest-first selection, it avoids a balance-ordering pattern that links spends, and it consumes dust over time. `DenominationCoinSelector` wraps SFRT and prefers exact covers, which produce no change; pass it as `selector` to `createWallet`. See [Denominations](/guide/denominations#selecting-for-zero-change).

### Spend cooldown

`cooldownBlocks` excludes notes received within that many blocks. It prevents spending change in the same block that created it, which would link the two transactions. It applies only when the chain layer implements `blockNumber` (the built-in viem adapter does) and notes have a `firstSeenBlock`.

### Concurrent spends

A spend leases the notes it selects until it settles. Two spends started together select disjoint notes, and a spend whose notes are all leased rejects `NOTES_HELD` with `retryable: true`. Leases are released when a spend fails definitively. After a submission whose outcome is unknown, its notes stay reserved until the spent set confirms them or the reservation expires; see [`SPEND_OUTCOME_UNKNOWN`](/guide/errors#spend-outcome-unknown).

## Consolidating explicitly

`autoConsolidate: true` merges notes automatically during a spend. To consolidate manually — to show progress, or ahead of time — self-transfer the notes named by `INSUFFICIENT_COVER`, pinning them with `selection.only`:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer({ asset: "USDC", amount: "500", recipient });
} catch (err) {
    if (!isWalletError(err, "INSUFFICIENT_COVER") || err.reason !== "arity") throw err;

    const merge = await wallet.transfer({
        asset: err.asset,
        amount: err.consolidateSum, // the notes' total, so no change is left over
        recipient: wallet.address,
        selection: { only: err.consolidate.map((n) => n.id) },
    });
    // The merged note is not spendable until it is indexed and in the tree.
    await wallet.awaitCommitments(merge.ownCommitments);

    await wallet.transfer({ asset: "USDC", amount: "500", recipient });
}
```

::: warning Pin the notes with `only`
A self-transfer of `consolidateSum` without `only` may select a different, single note of similar value instead of the intended small notes. The consolidation then changes nothing and the retry fails again.
:::

The self-transfer pays the relayer fee from the same notes when the fee is in the same asset, so `consolidateSum` may need to be reduced by the fee. Pass `feeAsset` to pay it from another asset instead.

## Maintenance

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
await wallet.sync({ reload: true }); // re-read the note store after an external mutation
const { removed } = await wallet.compact(); // drop spent notes; balances do not change
const rounds = await wallet.redenominate("USDC", { maxRounds: 4 }); // re-split change onto the ladder
await wallet.dispose(); // release scanner and prover workers
```

| Method | Effect |
|---|---|
| `sync({ reload: true })` | reloads the note store after an external change, then syncs |
| `compact()` | removes notes already marked spent |
| `redenominate(asset)` | self-transfers off-ladder notes onto denominations — see [Denominations](/guide/denominations#change-lands-on-the-ladder-too) |
| `dispose()` | releases workers — see [Disposing a wallet](/guide/wallet#disposing-a-wallet) |

Recovery tools that bypass the wallet's own bookkeeping — `markSpent`, direct access to the note store, selector, and tree — are on `walletInternals(wallet)` in `@lelantos-org/sdk/internal`, which carries no stability guarantee.

## Next

- [Custom storage](/guide/storage)
- [Pluggable interfaces](/guide/interfaces)
- [Denominations](/guide/denominations)
