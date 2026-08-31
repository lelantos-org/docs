# Note management

The pool tracks notes, not balances, so most wallet questions are really questions about which notes exist and which of them a single transaction can reach. This page covers reading the local cache, predicting what a spend can cover, and selecting notes yourself.

## Inspecting the cache

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
wallet.notes(); // every note, every asset
wallet.notes({ asset: 1n, spent: false }); // filter — both fields optional
wallet.balance(1n); // bigint, unspent only
wallet.balances(); // Map<assetId, bigint>, unspent only
```

These are synchronous reads of the local cache. They reflect the last `sync()` and nothing newer.

::: warning `allNotes()` was removed in 0.26.0
Call `notes()` instead. It takes the same `{ spent }` filter and reads across every asset when `asset` is omitted, so `allNotes(f)` becomes `notes(f)` unchanged.
:::

`WalletNote` is the integrator-facing type; the storage encoding (decimal-string bigints) is internal. For cryptographic fields — custom proofs, low-level builders — call `note.notePayload()` to get `{ asset, value, rho, rcm, rcvDep }` as native bigints.

## What a single spend can actually reach

**The balance is not the maximum sendable amount.** A "max" button built on `balance()` will produce `InsufficientCoverError` against a figure your own UI supplied.

`spendableMax()` answers the question the selector will actually be asked, under the same rules, and breaks down what is being held back.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { assetId, formatAmount } from "@lelantos-org/sdk";

const weth = await wallet.asset(1n);
const { max, withheld } = await wallet.spendableMax(assetId(1n));

console.log("send at most", formatAmount(max, weth, { symbol: true }));
console.log({
    reserved: withheld.reserved, // held by a submit whose outcome is unconfirmed
    dust: withheld.dust, // below the dust threshold
    cooldown: withheld.cooldown, // too recently seen to have cleared the cooldown
    slots: withheld.slots, // spendable, but beyond the circuit's input arity
});
```

The four causes are worth distinguishing in a UI. `reserved`, `dust`, and `cooldown` resolve with time. `slots` does not: the balance is spread across more notes than one transaction can consume, and only a consolidation merges it.

Pass the same `SelectOpts` a spend will use, so the prediction and the spend are computed under identical rules — including `maxInputs: nIn - 1` when a cross-asset fee will claim an input slot of its own.

## Selecting notes manually

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const chainTip = 1000;
// ---cut-end---
import { assetId, circuitAmount } from "@lelantos-org/sdk";

// `selectNotes` takes branded values; the constructors validate as they brand.
const asset = assetId(1n);
const target = circuitAmount(500n);

const result = wallet.selectNotes(asset, target, {
    fee: 25n, // cover threshold becomes target + fee
    dustThreshold: 100n, // exclude notes below this; ~2 × the marginal fee
    cooldownBlocks: 2, // minimum note age, in blocks
    tipBlock: chainTip, // required for the cooldown to apply at all
    bucketPct: 0.05, // tiebreak shuffle width
});

if (result.plan === "direct") {
    console.log(result.notes, result.sum);
} else {
    console.log("consolidate first:", result.consolidate);
}
```

The default selector is **SFRT** (Smallest-First, Random Tiebreak). It avoids the largest-first balance-ordering fingerprint and drains dust over time — both privacy properties, not performance ones.

`DenominationCoinSelector` wraps it and prefers a cover that pays the target exactly, which produces no change note at all. Inject it where withdrawals are denominated — see [Denominations](/guide/denominations).

### The spend cooldown

`cooldownBlocks` defaults to 1 and needs both `tipBlock` and a per-note `firstSeenBlock` to do anything; without them it is inert. One block is enough to break the same-block change-link heuristic, where a change note spent in the block that created it ties the two spends together for an observer counting leaves.

`connect()` supplies `tipBlock` from `ChainAdapter.blockNumber()` when the adapter implements it.

## Consolidating explicitly

`autoConsolidate: true` handles this on any spend. To drive it yourself, self-spend the notes the selector named — by **id**, not by amount.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { assetId, circuitAmount } from "@lelantos-org/sdk";

const plan = wallet.selectNotes(assetId(1n), circuitAmount(500n));

if (plan.plan === "consolidate-first") {
    // `only` pins the candidate set to exactly these notes.
    await wallet.transfer({
        to: wallet.address,
        asset: 1n,
        amount: plan.consolidateSum,
        selectOpts: { only: plan.consolidate.map((n) => n.id) },
    });
    await wallet.sync(); // the merged note is not spendable until it is in the tree
}
```

::: warning Name the ids, not just the amount
Asking for a self-transfer of `consolidateSum` does not name the dust. SFRT returns the smallest-*sum* cover of that amount, so any single note whose value falls between the target and the dust set's total is a cheaper cover than the dust set itself. When one exists the merge silently does nothing, and the retry then fails for exactly the same reason as the first attempt. `only` removes the ambiguity.
:::

## Housekeeping

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
declare const ids: string[];
// ---cut-end---
await wallet.refresh(); // re-read the store after an external mutation
const { removed } = await wallet.compact(); // drop spent notes; shrinks the file only
await wallet.markSpent(ids); // force-mark, for recovery flows
await wallet.dispose(); // release scanner and prover workers
```

`compact()` never changes a balance — it only removes notes already flagged spent. `dispose()` matters most in a long-lived browser session: a `WorkerPoolScanner` holds two to eight workers, each with its own WASM heap, so an application that rebuilds its wallet on every account switch leaks a pool per switch without it.

## Next

- [Custom storage](/guide/storage) — persisting the note cache
- [Pluggable interfaces](/guide/interfaces) — replacing the selector
- [Denominations](/guide/denominations) — how change is shaped, and `redenominate`
