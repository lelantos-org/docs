# Quickstart

This page takes you from an installed package to a completed round trip — shield, transfer, unshield — in one script. It runs against a local `anvil` node; substitute `network` and `rpcUrl` to target a deployed chain.

## Before you start

- [Installation](/guide/installation) completed, including the `.npmrc` token.
- Node 24 or later.
- An EVM private key funded with the asset you intend to shield.

A single EVM private key does two jobs. It signs on-chain transactions, and it derives the shielded spending key (`nsk`) through a domain-separated `keccak256` reduction. That one key is therefore enough to deposit, transfer, and withdraw — no second secret to manage.

## A complete round trip

```ts twoslash
// ---cut-start---
const peerBech32 = "lelantos1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
// ---cut-end---
import { connect, formatAmount, parseAmount } from "@lelantos-org/sdk";

// 1. Connect. Derives the shielded key, resolves the network preset, and
//    starts warming the prover in the background.
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});

console.log("shielded address:", wallet.address);

// 2. Resolve the asset. `scale` comes from the MASP registry; `symbol` and
//    `decimals` from the ERC-20, when the chain adapter can read them.
const weth = await wallet.asset(1n);
//    ^?

// 3. Shield. The permit and the ERC-20 pull happen in one atomic transaction.
await wallet.deposit({ asset: weth.id, amount: parseAmount("0.5", weth) });

// 4. Sync. A note is not spendable until the wallet has seen it *and* the
//    Merkle tree that contains it.
await wallet.sync({ onProgress: (p) => console.log(p.phase, p.fetched) });
console.log("balance:", formatAmount(wallet.balance(weth.id), weth, { symbol: true }));

// 5. Spend. `autoConsolidate` merges small notes and retries rather than
//    throwing when no cover exists.
await wallet.transfer({ to: peerBech32, amount: 100n, asset: 1n, autoConsolidate: true });

// 6. Unshield back to a public ERC-20 balance. `amount` is the gross leaving
//    the pool — the protocol fee is skimmed out of it, so the recipient gets
//    slightly less. `wallet.previewWithdraw` reports both figures.
await wallet.withdraw({ to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", amount: 200n, asset: 1n });

// 7. Release scanner and prover workers. Required in any process that
//    rebuilds the wallet — on an account or network switch, for instance.
await wallet.dispose();
```

Hover any identifier above to see its type. Every snippet on this site is compiled against the SDK during the build, so it cannot drift from the released API.

## Naming assets and amounts

Two conveniences remove most of the ceremony from the calls above.

**An asset can be named three ways.** `asset` accepts a registry id, an ERC-20 address, or a symbol. A `0x…` string is read as a token address; `1n` or `"1"` as an id; anything else as a symbol.

**An amount can be a human string.** Pass a `bigint` for exact circuit units, or a decimal string for a human amount of the token — the SDK converts it against the asset's `decimals`.

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
// Equivalent, given a registry where asset 1 is USDC:
await wallet.transfer({ to: peerBech32, asset: "USDC", amount: "12.50" });
await wallet.transfer({ to: peerBech32, asset: 1n, amount: 12_500_000n });
```

::: warning A symbol that matches two assets is rejected
Two registered tokens may legitimately share a symbol, and picking either would send funds to whichever happened to be registered first. That raises `InvalidArgumentError` — name the asset by id or token address instead. See [Amounts](/guide/amounts).
:::

## What just happened

- **Prover artifacts** resolve automatically on Node when `@lelantos-org/circuits` is installed. Browser callers pass `proverArtifacts: { circuit, zkey }` to `connect()` — see [Browser usage](/guide/browser).
- **`autoConsolidate: true`** self-spends the smallest notes and retries, instead of throwing `InsufficientCoverError`. See [Errors](/guide/errors).
- **Networks** — `mainnet`, `base`, and `arbitrum` are deployed. `sepolia` is a placeholder and throws `NetworkNotDeployedError`. See [Networks](/guide/networks).
- **A `bigint` amount is always circuit units**, never token decimals. Read [Amounts](/guide/amounts) before hard-coding a literal — this is the most common source of wrong-by-a-factor-of-10^18 bugs.

## Handling the first failure you will hit

A spend consumes at most `nIn` notes — four at the default circuit shape. A balance spread across more notes than that cannot be reached in one transaction, and the wallet says so rather than silently sending less.

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
import { isWalletError } from "@lelantos-org/sdk";

try {
    await wallet.transfer({ to, amount: 100n });
} catch (e) {
    if (!isWalletError(e, "INSUFFICIENT_COVER")) throw e;
    // Typed here without a cast: these fields belong to this error class.
    console.log("merge these first:", e.consolidate.map((n) => n.id));
}
```

Pass `autoConsolidate: true` to have the wallet do this for you. See [Errors](/guide/errors) for the full catalogue.

## Going lower

`connect()` is a convenience wrapper that mixes key sources, resolves a network preset, and fills in every default. `Wallet.create(source, cfg)` takes an explicit `WalletConfig` instead, giving you control over every pluggable interface — storage, coin selection, submission, note sourcing, proving.

```ts twoslash
import { Wallet } from "@lelantos-org/sdk";
//       ^?
```

See [Pluggable interfaces](/guide/interfaces).

## Next

- [Concepts](/guide/concepts) — what a note is, and why sync exists
- [Creating a wallet](/guide/wallet) — mnemonics, MetaMask, hardware signers
- [Amounts](/guide/amounts) — circuit units in full
