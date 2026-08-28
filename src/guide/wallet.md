# Creating a wallet

`ConnectOptions` is two independent choices: where the **shielded spending key** comes from, and how transactions **reach the chain**. Each key source produces a deterministic `nsk` field element, from which the wallet keys (`ivk`, `pk`, `pk_d`, `dk`) and the bech32m address derive.

| Key source | Chain layer |
|---|---|
| `mnemonic` — BIP-39, the portable option | `privateKey` — raw hex, for Node scripts |
| `signature` — hex of the canonical EIP-712 message | `signer` — a pre-built `EthSigner` |
| `nsk` — pre-derived; derivation is yours | `provider` + `address` — a browser EIP-1193 provider |
| *omitted* — derived from the chain layer, where it can | `chain` — a pre-built `ChainAdapter` |

Omitting the key source is valid whenever the chain layer can supply one: `privateKey` derives it by reduction, and `signer` or `provider` derives it from a single EIP-712 signature. A pre-built `chain` adapter exposes no signing key, so that combination always needs an explicit source.

## `connect({ privateKey })` — hex EVM key

One key signs on-chain transactions and derives `nsk` via a domain-separated `keccak256` reduction.

```ts twoslash
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
```

`hexPrivateKeyToNsk(hex)` exposes the derivation on its own if you need the `nsk` without a wallet.

## `connect({ mnemonic })` — BIP39

The mnemonic derives `nsk` only. Chain signing still comes from `signer`, `privateKey`, or `chain`.

```ts twoslash
import { connect, generateMnemonic, isValidMnemonic } from "@lelantos-org/sdk";

const mnemonic = generateMnemonic({ words: 24 });
if (!isValidMnemonic(mnemonic)) throw new Error("bad seed");

const wallet = await connect({
    mnemonic,
    network: "anvil",
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    rpcUrl: "http://localhost:8545",
    account: 0,
});
```

## `connect({ signer })` — MetaMask or hardware

One EIP-712 prompt at boot; subsequent on-chain transactions reuse the signer.

<!-- typecheck: skip -->
```ts
import { BrowserProvider } from "ethers";

const provider = new BrowserProvider(window.ethereum);
await provider.send("eth_requestAccounts", []);
const signer = await provider.getSigner();

const wallet = await connect({
    signer,
    network: "mainnet",
    rpcUrl: window.ethereum.rpcUrl,
});
```

::: tip Why this block is not typechecked
It depends on `ethers` and a browser `window.ethereum`, neither of which the docs build installs. Every other snippet on this site is compiled against the SDK at build time.
:::

## `Wallet.create()` — full control

`connect()` resolves a network preset and fills in every default. `Wallet.create(source, cfg)` does neither: it takes a `KeySource` and an explicit `WalletConfig`, so nothing is inferred.

```ts twoslash
// ---cut-start---
import type { ChainAdapter } from "@lelantos-org/sdk";
declare const chain: ChainAdapter;
// ---cut-end---
import { Wallet } from "@lelantos-org/sdk";

const wallet = await Wallet.create(
    // `KeySource` is a discriminated union on `type`; `resolveNsk` from
    // `@lelantos-org/sdk/keys` reduces any variant to the `nsk` itself.
    { type: "mnemonic", mnemonic: "…", account: 0 },
    {
        chainId: 31337n,
        treeDepth: 10,
        relayerAddress: "0x0000000000000000000000000000000000000002",
        chain,
        fmdUrl: "http://localhost:8080",
        relayerUrl: "http://localhost:8081",
        proverPaths: { wasmPath: "./transact_4x4.wasm", zkeyPath: "./transact_4x4_final.zkey" },
    },
);
```

`chainId`, `treeDepth`, `relayerAddress`, and `chain` are required; everything else defaults.

::: warning `proverPaths` and `proverArtifacts` are different shapes
`WalletConfig.proverPaths` is `{ wasmPath, zkeyPath }`. `connect({ proverArtifacts })` is `{ circuit, zkey }`. They name the same two files; only the keys differ by entry point.
::: `fmdUrl` is required unless you supply a `noteSource`, `relayerUrl` unless you supply a `submitter`, and `proverPaths` unless you supply a `prover`. See [Pluggable interfaces](/guide/interfaces).

::: warning `treeDepth` must match the deployed contract and circuit build
A tree of the wrong depth produces paths and a root of that depth. Nothing errors locally — the proof simply fails to verify on chain.
:::

## Releasing a wallet

`dispose()` releases the scanner pool and any prover worker the wallet built, and the wallet must not be used afterwards. It is idempotent.

An application that rebuilds its wallet on an account or network switch **must** call it. A `WorkerPoolScanner` holds two to eight workers, each with its own WASM heap, so without it every switch leaks a pool.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
await wallet.dispose();
```

## Invalid combinations do not compile

`ConnectOptions` is an exclusive union of one key source (`mnemonic` | `signature` | `nsk`) and one chain layer (`chain` | `signer` | `{ provider, address }` | `privateKey`). Passing two key sources is a **compile-time** error, not a runtime one:

```ts twoslash
// @errors: 2345
import { connect, generateMnemonic } from "@lelantos-org/sdk";
const mnemonic = generateMnemonic({ words: 24 });
const nsk = 1n;
const rpcUrl = "https://eth.example.com";
const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
// ---cut---
// One valid chain layer, but two key sources — the union rejects it.
await connect({ network: "mainnet", mnemonic, nsk, privateKey, rpcUrl });
```

That error is asserted by this site's build: if the union ever stopped rejecting it, the page would fail to compile.

## Next

- [Amounts](/guide/amounts) — before you hard-code any number
- [Addresses](/guide/addresses)
- [Pluggable interfaces](/guide/interfaces) — what `WalletConfig` accepts
