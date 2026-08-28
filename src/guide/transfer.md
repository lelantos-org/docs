# Transfer (shielded → shielded)

A transfer never touches a public balance. It spends your notes and creates new ones — one for the payee, one for your change, and one for the relayer's fee when it charges.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const peerBech32 = wallet.address;
// ---cut-end---
const tx = await wallet.transfer({
    to: peerBech32,
    amount: 100n, // bigint = circuit units; "1.25" = human units
    asset: 1n, // id, token address or symbol
    selectOpts: { dustThreshold: 10n },
    autoConsolidate: true,
    onPhase: (p) => console.log(p), // "preparing" | "proving" | "submitting"
});

tx.recipientCommitment;
// ^?
```

`onPhase` is worth wiring into any UI: `"proving"` is a multi-second, CPU-bound step, and a progress indicator that does not distinguish it from a network round trip reads as a hang. See [Browser usage](/guide/browser) for measured timings.

::: warning Read `recipientCommitment`, not `commitments[0]`
Output slots are **shuffled** — that is a privacy property, not an implementation detail. Their order is precisely what would otherwise publish which commitment belongs to the payee. Indexing `commitments` gives you the right one only by luck.
:::

## Reading the receipt

`TransferResult` reports both sides of the transaction:

| Field | Meaning |
|---|---|
| `recipientCommitment` | the payee's note — the only reliable way to identify it |
| `ownCommitments` | outputs this wallet can recover: change, and the payee note on a self-transfer |
| `nonZeroCommitments` | outputs with value, excluding the circuit's zero-value pads |
| `spent` | ids of the notes consumed |
| `inputSum` / `sent` / `change` | value in, value to the payee, value back to you |

Handing `recipientCommitment` to the payee leaks nothing: they recover the same note by scanning regardless.

## When no cover exists

The wallet auto-selects unspent notes up to the circuit's input arity, and change returns to you. When no selection covers the amount, it throws `InsufficientCoverError` rather than sending less.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const to = wallet.address;
const amount = 100n;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer({ to, amount });
} catch (e) {
    if (isWalletError(e, "INSUFFICIENT_COVER")) {
        // `e.consolidate` / `e.consolidateSum` are typed here — no `instanceof`.
        console.log("consolidate first:", e.consolidate.map((n) => n.id), e.consolidateSum);
    } else throw e;
}
```

`isWalletError(e, "INSUFFICIENT_COVER")` narrows the type, so the recovery fields are available without a cast. See [Errors](/guide/errors).

### Letting the wallet recover

`autoConsolidate: true` self-spends the notes the selector named and retries the transfer, which is the right default for most applications:

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const to = wallet.address;
// ---cut-end---
await wallet.transfer({ to, amount: 100n, autoConsolidate: true });
```

It costs an extra transaction, an extra proof, and an extra sync, so a UI that wants to show what is happening should catch the error and drive the merge itself. See [Note management](/guide/notes) for that flow — and note that the merge must name the notes by **id**, not by amount.

To avoid the failure entirely, size the transfer against `wallet.spendableMax()` rather than `wallet.balance()`.

## Paying the fee in another asset

`feeAsset` moves the relayer's shielded fee onto a different asset, at the cost of two extra circuit slots. See [Fees](/guide/fees) for the constraints — it requires `nOut >= 4`, and the relayer has to quote that asset.

## Next

- [Withdraw](/guide/withdraw)
- [Fees](/guide/fees) — quoting before you build
- [Note management](/guide/notes) — selecting notes yourself
