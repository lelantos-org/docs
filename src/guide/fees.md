# Fees

Three separate costs can apply to one operation, and they are charged by three different parties. Conflating them is a common source of "the numbers do not add up" bugs.

| Fee | Charged by | Paid in | Visible on chain |
|---|---|---|---|
| **Gas** | the network | native ETH | yes |
| **Protocol fee** | the MASP contract | the asset being moved, taken from `publicOut` | yes, on unshield |
| **Shielded relayer fee** | the relayer | any asset it quotes, as an output note | no |

Gas is only your concern on the paths your own signer broadcasts — a deposit, or a withdraw you submit directly. On relayed spends the relayer pays gas and recovers it through the shielded fee.

## The protocol fee

`chain.fetchFeeBps()` returns the rate in basis points; `0` disables it. On a withdraw the contract sends `outAmt - fee` to the recipient and keeps `fee` in the treasury, so `sent` on the receipt is the **gross** amount, not what the recipient receives.

Override it for a chain whose rate you already hold with `WalletConfig.feeBps`, which takes precedence over the adapter call.

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
It costs two extra slots — an input note of the fee asset, and an output for its change. That requires `nOut >= 4`, which the default 4×4 shape satisfies and a pool on `TRANSACT_3X3` does not.

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
