# Swap

An atomic shielded-to-shielded swap. Leg 1 unshields to a `SwapWrapper`; leg 2 re-shields the output note. Both legs are bundled through `submitter.submitSwap`, so the value is never sitting unshielded between two transactions — which is the whole point, and why a swap cannot be assembled from a `withdraw` followed by a `deposit`.

A swap needs a `Submitter` that implements `submitSwap`. The default `HttpRelayerSubmitter` does; a custom one that omits it cannot run this path.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
const peerBech32 = wallet.address;
const quoterUrl = "https://quote.lelantos.xyz";
const chainId = 1n;
const tokenIn = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const;
const tokenOut = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const amountIn = 1000n;
// ---cut-end---
import { fetchSwapQuote } from "@lelantos-org/sdk/quoter";

const quote = await fetchSwapQuote(quoterUrl, {
    chainId,
    tokenIn,
    tokenOut,
    amountIn,
    slippageBps: 50,
});

await wallet.swap({
    assetIn: 1n,
    assetOut: 2n,
    amount: 100n, // gross publicOut in circuit units of `assetIn`
    quote, // pins route + minOut
    wrapperAddress: "0x0000000000000000000000000000000000000001",
    bRecipient: peerBech32, // optional, default own address
});
```

## What the swap actually credits

This is the part that is easy to get wrong in a UI.

The re-shielded B-note is **not** `quote.minOut / scaleOut`, and it is not a floor either. `swap()` sizes it with `sizeBNote` and encodes that exact value as the deposit leg's `publicIn` — so that is what the wallet receives. The wrapper pulls only what the note needs, and any better-than-quoted fill goes to the treasury as dust.

Show this figure, not `expectedOut`:

```ts twoslash
// ---cut-start---
import type { ChainAdapter } from "@lelantos-org/sdk/chain";
import type { AssetId } from "@lelantos-org/sdk";
declare const chain: ChainAdapter;
declare const asset: AssetId;
declare const quote: { minOut: bigint };
// ---cut-end---
import { sizeBNote } from "@lelantos-org/sdk/wallet";

const { scale, depositBps } = await chain.fetchAsset(asset);
const credited = sizeBNote(quote.minOut, scale, depositBps);
//    ^?
```

Leg 2 mints the B-note as a deposit, so the rate here is the **out** asset's `depositBps` — not its `withdrawBps`, and not the in-asset's rate. Both ride on the registry entry; there is no pool-wide fee to read.

::: danger Do not re-derive this
The obvious closed form — `minOut * BPS / (scale * (BPS + depositBps))` — is only the lower bound the search starts from. It lands *below* `minOut` whenever the division is inexact: wrong on screen, and reverting on chain if used to size a transaction.
:::

## Reading the receipt

`SwapResult` reports **leg 1 only** — `spent`, `inputSum`, `sent`, and `change` all describe the unshield into the wrapper. The re-shielded B-note arrives as a deposit, so it surfaces through `depositId` and does not appear in `commitments`.

That also means the B-note follows the deposit lifecycle: it is escrowed when the swap is mined, and only spendable once the relayer has flushed it into the tree and the wallet has synced. See [Deposit](/guide/deposit#the-deposit-lifecycle).

## Next

- [Syncing](/guide/sync) — the B-note is not spendable until it is synced
- [Fees](/guide/fees) — swaps are quoted on their own endpoint
- [Low-level primitives](/guide/primitives)
