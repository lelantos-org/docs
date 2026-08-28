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

Change splits into new self-notes. The MASP sends `outAmt - fee` to the recipient and the treasury keeps `fee`.

::: warning `sent` on the receipt is gross, not net
`WithdrawResult.sent` is the `publicOut` leaving the pool — the protocol fee included. `MASP._unshieldLeg` skims the fee out of that amount rather than charging it on top, so the recipient's ERC-20 balance rises by less than `sent`. Show both figures in a UI.
:::

The fee is taken from the **converted token amount**, so compute the split in ERC-20 base units — doing it in circuit units rounds at the wrong point and misreports the net by up to a unit.

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
import { applyFee, formatUnits, toTokenUnits } from "@lelantos-org/sdk/core";
import { circuitAmount, requireTokenMeta } from "@lelantos-org/sdk";

const weth = requireTokenMeta(await wallet.asset(1n));
const feeBps = await wallet.chain.fetchFeeBps();

const gross = circuitAmount(200n); // what leaves the pool
const grossTokens = toTokenUnits(gross, weth.scale);
const fee = applyFee(grossTokens, feeBps);

console.log("recipient receives", formatUnits(grossTokens - fee, weth.decimals), weth.symbol);
await wallet.withdraw({ to, amount: gross, asset: weth.id });
```

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

## Next

- [Swap](/guide/swap)
- [Fees](/guide/fees) — protocol fee versus relayer fee
- [Errors](/guide/errors)
