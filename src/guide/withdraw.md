# Withdraw (unshield)

A withdraw spends shielded notes and pays a public EVM address. It is the point at which value becomes visible again, so the recipient address is the one piece of the transaction that is public by design.

## To an ERC-20 balance

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
const tx = await wallet.withdraw({
    to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    amount: 200n,
    asset: 1n,
    autoConsolidate: true,
    onPhase: (p) => console.log(p), // "preparing" | "proving" | "submitting"
});
```

Change splits into new self-notes, decomposed onto the asset's withdrawal ladder where it has one — see [Denominations](/guide/denominations).

## What the recipient actually receives

::: danger `amount` is the gross, and that changed in 0.28
`WithdrawOptions.amount` is `publicOut` — the amount **leaving the pool**. Earlier versions read it as the net delivered and grossed it up by the protocol fee; they no longer do, so the same call now withdraws slightly less than it used to. Audit any amount carried over from 0.27 or earlier.

`MASP._unshieldLeg` skims the fee out of what leaves the pool (`net = outAmt - fee`) rather than charging it on top, which makes `publicOut` the figure the chain publishes — and therefore the figure that has to be a round denomination if the withdrawal is to blend with anyone else's. `SwapOptions.amount` has always meant the same thing.
:::

`previewWithdraw` answers what a withdrawal would publish, cost and deliver, without proving or submitting anything. It is pure, so a UI can call it on every keystroke.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
const p = await wallet.previewWithdraw({ asset: "USDC", amount: "1000" });

p.publicOut; // gross in circuit units — what the chain sees
p.netFormatted; // "998" — what the recipient gets
p.onLadder; // whether this gross blends with other users' withdrawals
p.suggestion; // nearest denomination, when it does not
//    ^?
```

The receipt carries the same split, so nothing has to be recomputed after the fact — doing so needs the asset's `scale`, its rate and the yield index as they were at submission.

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
const tx = await wallet.withdraw({ to, amount: 200n, asset: 1n });

tx.sent; // gross `publicOut`, circuit units
tx.received; // ERC-20 base units that reached the recipient
tx.feePaid; // ERC-20 base units the protocol kept — `received + feePaid` is the gross
```

Without a wallet in hand, `withdrawNetFor(publicOut, asset)` is the same split off an `AssetInfo`, and `withdrawNet` from `@lelantos-org/sdk/core` the fully manual form. Do not apply the rate yourself: the yield branch charges the fee in normalized units *before* conversion, and the plain branch after, so the wrong one is off by up to a unit.

## To native ETH

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
await wallet.withdrawEth({
    to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    amount: 200n,
    asset: 1n, // must be the registered WETH asset
});
```

Unwraps the WETH-shielded asset to native ETH in a single transaction, through the `NativeAdapter` — the pool itself is ERC-20 only. The asset id must be the chain's registered WETH, and the chain must have an adapter deployed; without one the path raises `DepositAdapterError`.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { supportsNativeEth } from "@lelantos-org/sdk";

// Feature-probe before offering the option in a UI.
const canUnwrap = supportsNativeEth(wallet.chain);
```

## Withdrawing the maximum

`balance()` is not a safe maximum — the selector withholds reserved, dust, and cooling-down notes, and one spend reaches only `nIn` of what remains. Size against `spendableMax()` instead, reserving the relayer fee if one is charged.

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
import { assetId } from "@lelantos-org/sdk";

const quote = await wallet.quoteFee({ kind: "withdraw" });
const fee = quote.options.find((o) => o.asset.id === 1n)?.amount ?? 0n;

const { max } = await wallet.spendableMax(assetId(1n), { fee });
if (max > 0n) await wallet.withdraw({ to, amount: max, asset: 1n });
```

On an asset with a ladder, the maximum is rarely a denomination. Withdrawing it publishes a near-unique integer, so prefer the largest denomination at or below `max` — `nearestDenomination` and `wallet.withdrawDenominations()` both name it.

## Next

- [Denominations](/guide/denominations) — why the gross should be a round number
- [Swap](/guide/swap)
- [Fees](/guide/fees) — protocol fee versus relayer fee
- [Errors](/guide/errors)
