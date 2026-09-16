# Quickstart

This page runs a complete round trip in one script: shield, transfer, and unshield. Set `network` and `rpcUrl` for your target chain.

## Prerequisites

- [Installation](/guide/installation), including the `.npmrc` token and the `viem` peer
- Node 24 or later
- An EVM private key funded with the asset to shield, and an RPC endpoint for the chain

One EVM private key is enough. It signs on-chain transactions and also derives the shielded spending key (`nsk`), so no second secret is needed.

## Round trip

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const peer: string;
// ---cut-end---
import { connect, formatAmount } from "@lelantos-org/sdk";

// 1. Connect. Resolves the network preset and derives the shielded key.
//    Nothing is downloaded for proving until the first spend.
const wallet = await connect({
    network: "base",
    rpcUrl: "https://base-rpc.example.com", // public presets ship no RPC endpoint
    privateKey,
});

console.log("shielded address:", wallet.address);

// 2. Shield 0.5 WETH. Amounts are decimal strings of the token, or values the
//    SDK returned. The permit and the ERC-20 pull happen in one transaction.
const deposit = await wallet.deposit({ asset: "WETH", amount: "0.5" });

// 3. Wait for the relayer to add the note to the tree, then sync.
await wallet.awaitDeposit(deposit.escrow);
await wallet.sync();

const balance = await wallet.balance("WETH");
//    ^?
console.log(formatAmount(balance.spendable, balance.asset, { symbol: true })); // "0.5 WETH"

// 4. Transfer to another shielded address. `autoConsolidate` merges notes and
//    retries rather than throwing when no single spend can cover the amount.
await wallet.transfer({ asset: "WETH", amount: "0.1", recipient: peer, autoConsolidate: true });

// 5. Unshield. `gross` leaves the pool and the protocol fee comes out of it;
//    pass `net` instead to name what the recipient receives.
const out = await wallet.withdraw({
    asset: "WETH",
    gross: "0.2",
    recipient: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
});
console.log("received", formatAmount(out.net.amount, out.asset), "on ladder:", out.onLadder);

// 6. Release workers. Required in any process that rebuilds the wallet.
await wallet.dispose();
```

Every snippet on this site is compiled against the SDK at build time. Hover an identifier to see its type.

| Step | Detail |
|---|---|
| Networks | `mainnet`, `base`, and `arbitrum` are deployed. `rpcUrl` is required for them. See [Networks](/guide/networks). |
| Prover artifacts | Resolved from `@lelantos-org/circuits` on Node, on first use. Browsers pass `prover: { artifacts }` — see [Browser usage](/guide/browser). |
| Amounts | `"0.5"` is in token units; a plain `bigint` does not compile. See [Amounts and assets](/guide/amounts). |
| Settlement | A deposit is spendable only after the relayer adds it to the tree and the wallet syncs. See [Deposit](/guide/deposit#the-deposit-lifecycle). |

## Asset and amount inputs

`asset` accepts a registry id, an ERC-20 address, or a symbol, and is required on every operation. `amount` names its unit space by its shape:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const peer: string;
// ---cut-end---
import { circuitAmount } from "@lelantos-org/sdk";

// Equivalent, given a registry where asset 1 is USDC at scale 1:
await wallet.transfer({ recipient: peer, asset: "USDC", amount: "12.50" }); // token units
await wallet.transfer({ recipient: peer, asset: 1n, amount: { baseUnits: 12_500_000n } }); // base units
await wallet.transfer({ recipient: peer, asset: 1n, amount: circuitAmount(12_500_000n) }); // circuit units
```

A symbol shared by two registered assets raises `INVALID_ARGUMENT`. Use the id or token address in that case. See [Amounts and assets](/guide/amounts#three-ways-to-name-an-asset).

## Handling errors

Every method rejects with a `WalletError` that carries a stable `code` and a `retryable` flag. `isWalletError(err, code)` narrows the error to that code's class, so its fields are typed.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
// ---cut-end---
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer({ asset: "WETH", amount: "1", recipient });
} catch (err) {
    if (isWalletError(err, "INSUFFICIENT_COVER")) {
        // The balance is spread over more notes than one spend can use.
        console.log("merge these first:", err.consolidate.map((n) => n.id));
    } else if (isWalletError(err, "NOTES_HELD") && err.retryable) {
        // Notes are leased by another spend in flight; retry shortly.
    } else {
        throw err;
    }
}
```

Pass `autoConsolidate: true` to merge notes and retry automatically. See [Note management](/guide/notes#consolidating-explicitly) and [Errors](/guide/errors).

## Explicit configuration

`connect()` resolves a network preset and fills in defaults. `createWallet(keySource, config)` from `@lelantos-org/sdk/advanced` takes an explicit `WalletConfig` and infers nothing.

```ts twoslash
import { createWallet } from "@lelantos-org/sdk/advanced";
//       ^?
```

See [Connecting a wallet](/guide/wallet) and [Pluggable interfaces](/guide/interfaces).

## Next

- [Concepts](/guide/concepts) — notes, nullifiers, the tree, and sync
- [Connecting a wallet](/guide/wallet) — key sources, chain layers, prover and storage options
- [Amounts and assets](/guide/amounts) — circuit units and conversions
