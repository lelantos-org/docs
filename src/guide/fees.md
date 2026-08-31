# Fees

Three separate costs can apply to one operation, and they are charged by three different parties. Conflating them is a common source of "the numbers do not add up" bugs.

| Fee | Charged by | Paid in | Visible on chain |
|---|---|---|---|
| **Gas** | the network | native ETH | yes |
| **Protocol fee** | the MASP contract | the asset being moved — added to a shield, skimmed from an unshield | yes |
| **Shielded relayer fee** | the relayer | any asset it quotes, as an output note | no |

Gas is only your concern on the paths your own signer broadcasts — a deposit, or a withdraw you submit directly. On relayed spends the relayer pays gas and recovers it through the shielded fee.

## The protocol fee

Rates are **per asset and per leg**. There is no pool-wide rate, so nothing fetches one: both numbers are resolved with the asset and ride on `AssetInfo`.

| Rate | Charged on | How |
|---|---|---|
| `depositBps` | a shield — `deposit`, and a swap's re-shield leg | **added on top of** the principal |
| `withdrawBps` | an unshield — `withdraw`, and a swap's first leg | **skimmed from** the gross leaving the pool |

A pool can price the two apart — subsidising deposits to fill itself while still charging on exits — so passing one where the other belongs is a real misquote, not a rounding difference.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { withdrawNetFor } from "@lelantos-org/sdk";

const usdc = await wallet.asset("USDC");
usdc.depositBps; // shield rate, in basis points
usdc.withdrawBps; // unshield rate

// What a 1000-unit gross withdrawal actually delivers, in ERC-20 base units.
const { net, fee } = withdrawNetFor(1000n, usdc);
//      ^?
```

`withdrawNetFor` reads `withdrawBps`, `scale`, `index` and `yieldEnabled` off the asset, which is why it takes the asset rather than a rate: the yield branch rounds at a different point and misreports the net by up to a unit if `yieldEnabled` is assembled by hand and left out.

::: warning A withdrawal's `amount` is the gross
`MASP._unshieldLeg` sends `outAmt - fee` to the recipient and keeps `fee`, so `WithdrawOptions.amount` is what leaves the pool, not what arrives. `wallet.previewWithdraw` shows both figures — see [Withdraw](/guide/withdraw#what-the-recipient-actually-receives).
:::

### Overriding the rates

`feeBps` on `connect()` and `WalletConfig` replaces what the pool reports, for every asset. A bare `bigint` sets both legs; the pair prices them apart.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
// ---cut-end---
await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
    feeBps: { depositBps: 0n, withdrawBps: 25n },
});
```

It is applied when an `AssetInfo` is resolved, so deposit, withdraw, swap and `previewWithdraw` all see the same numbers and cannot drift apart. Reach for it only where the SDK cannot read the real rates — a fork, a fixture, a registry that is not deployed yet. Against a live pool it misquotes the moment the owner changes a rate.

## The shielded relayer fee

A relayer may charge for relaying, and it charges privately: the fee is an output note addressed to the relayer, built into the spend it pays for. Nothing on chain links the payer to the transaction.

`quoteFee()` prices an operation before you build it, and reports which assets this wallet could actually pay in.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

const quote = await wallet.quoteFee({ kind: "transfer" });

if (!quote.charged) {
    console.log("this relayer relays transfers for free");
} else {
    for (const option of quote.options) {
        console.log(
            option.asset.symbol ?? option.asset.id,
            formatAmount(option.amount, option.asset),
            option.affordable ? "affordable" : "insufficient balance",
        );
    }
}
```

`kind` is `"transfer"`, `"withdraw"`, `"withdrawNative"`, `"swap"`, or `"deposit"`. Swaps and deposits are quoted on their own endpoints: a swap's gas covers two legs plus the on-chain swap, and a deposit is priced against the relayer's later `flushBatch` rather than at submit time.

::: warning `affordable` is necessary, not sufficient
It compares the fee against the unspent balance in that asset. The notes still have to fit the circuit's input slots, which only coin selection can decide — so an affordable option can still fail with `InsufficientCoverError`.
:::

## Paying the fee in a different asset

By default the fee comes out of the asset being moved. Set `feeAsset` to pay in another one — useful when the moved asset is exactly consumed, or when one asset holds the wallet's liquid balance.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const to = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
// ---cut-end---
await wallet.withdraw({ to, asset: "WETH", amount: "0.5", feeAsset: "USDC" });
```

::: danger A cross-asset fee needs a wider circuit
It costs two extra slots — an input note of the fee asset, and an output for its change. That requires `nOut >= 4`, which the only published shape (4×6) satisfies with room to spare.

The relayer must also quote the asset. `/chains` publishes the list, and one it does not quote is rejected before any proving starts.
:::

When sizing a spend against `spendableMax()`, pass `maxInputs: nIn - 1` so the prediction leaves the fee its input slot. See [Note management](/guide/notes).

## When a fee quote goes stale

A relayer that refuses a submission over its shielded fee answers `402`, which surfaces as a `NetworkError`. Re-estimate and rebuild — resubmitting the same payload is refused again.

```ts twoslash
// ---cut-start---
import { RelayerClient } from "@lelantos-org/sdk/relayer";
import type { SubmitTransactPayload } from "@lelantos-org/sdk/protocol";
declare const relayer: RelayerClient;
declare const payload: SubmitTransactPayload;
// ---cut-end---
import { isShieldedFeeRejection } from "@lelantos-org/sdk/relayer";

try {
    await relayer.submitTransact(payload);
} catch (e) {
    if (!isShieldedFeeRejection(e)) throw e;
    // `e.body` names the asset, what was paid, what was required, and the
    // grace band.
}
```

## Next

- [Errors](/guide/errors) — the full catalogue
- [Low-level primitives](/guide/primitives) — building the fee output by hand
