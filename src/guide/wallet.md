# Connecting a wallet

`connect(options)` returns a `WalletApi`: a frozen object of bound methods (`deposit`, `transfer`, `withdraw`, `quoteSwap`, `sync`, `balance`, `state`, …). Its options fall into four independent groups:

| Group | Options | Required |
|---|---|---|
| Network | `network`, `rpcUrl` | `network` always; `rpcUrl` unless the preset carries one or the chain layer is pre-built |
| Key source | `mnemonic` (+ `account`, `passphrase`), `signature`, `nsk` | unless the chain layer derives the key |
| Chain layer | `privateKey`, `signer`, `provider` + `address`, `readOnly`, `reader`, `chain` | exactly one |
| Extras | `prover`, `scanner`, `http`, `storage`, `shape`, `denominations`, `syncStrategy`, `wasm`, `runtime` | no |

The wallet's viewing keys and bech32m address are derived from the shielded spending key (`nsk`).

::: warning Funds belong to `nsk`
Notes can be spent only with the `nsk` they were shielded under. Each key source derives `nsk` deterministically; the same input always yields the same key and address. Back up the input (mnemonic, private key, or `nsk` itself).
:::

## What `connect` does, in order

1. Validates every option at once. A problem throws `WALLET_CONFIG` listing all of them in `missing`, before any prompt or request.
2. Resolves the network preset. A placeholder preset throws `NETWORK_NOT_DEPLOYED`.
3. Builds the chain layer.
4. Creates the prover handle, without fetching anything (see [Prover](#prover)).
5. Loads wasm and builds the scanner and stores.
6. Derives the key last. With a `signer` or `provider` and no explicit key source, this is the one EIP-712 signature prompt `connect` issues. A declined prompt throws `USER_REJECTED`.

Anything `connect` built before a failure is disposed. A `Prover` or `Scanner` instance you passed is left running: it is yours.

## Key source and chain layer

| Chain layer | Signs deposits | Derives `nsk` without a key source |
|---|---|---|
| `privateKey` — raw hex key, for Node scripts | yes | yes, by domain-separated reduction |
| `signer` — an `EthSigner` | yes | yes, from one EIP-712 signature |
| `provider` + `address` — an EIP-1193 provider | yes | yes, from one EIP-712 signature |
| `readOnly: true` — reads through `rpcUrl` | no | no |
| `reader` — a pre-built `ChainReader` | no | no |
| `chain` — a pre-built `ChainAdapter` | yes | no |

Only deposits (and cancelling one, and allowance setup) need an EOA. Transfers, withdrawals, and swaps are authorized by the proof and broadcast by the relayer, so a `readOnly` wallet spends normally; `wallet.capabilities.deposit` is `false` for it.

### `privateKey`

The private key signs on-chain transactions and derives `nsk`.

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl: "https://base-rpc.example.com",
    privateKey,
});
```

### `mnemonic`

A mnemonic derives `nsk` only (ZIP-32, account `0` by default). Pair it with any chain layer, including `readOnly`.

```ts twoslash
import { connect, generateMnemonic, isValidMnemonic } from "@lelantos-org/sdk";

const mnemonic = generateMnemonic({ words: 24 });
if (!isValidMnemonic(mnemonic)) throw new Error("bad seed");

const wallet = await connect({
    network: "base",
    rpcUrl: "https://base-rpc.example.com",
    mnemonic,
    account: 0,
    readOnly: true, // spends work; deposits need an EOA
});

wallet.capabilities.deposit; // false
```

### Browser wallets: `provider` + `address`

For MetaMask or any EIP-1193 provider, pass the provider and the account to sign as. The user signs one EIP-712 message at the end of `connect` to derive `nsk`; later deposits use the same provider.

```ts twoslash
// ---cut-start---
declare const window: { ethereum: { request(args: { method: string; params?: unknown[] }): Promise<unknown> } };
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const [address] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
if (!address) throw new Error("no account");

const wallet = await connect({
    network: "base",
    rpcUrl: "https://base-rpc.example.com",
    provider: window.ethereum,
    address,
});
```

Any library that exposes an EIP-1193 `request` function works the same way, including an ethers `BrowserProvider`'s underlying provider or a WalletConnect provider.

The signed message is a fixed EIP-712 structure in the domain `{ name: "Lelantos", version: "1" }`, with no chain id, so the same account derives the same `nsk` on every network. Signature encodings that differ only in `v` or in high/low `s` derive the same key.

To derive `nsk` without connecting, use `deriveNskFromSigner(signer)`. `lelantosTypedDataHash()` from `@lelantos-org/sdk/primitives` returns the digest that is signed.

### Passkeys

A passkey that supports the WebAuthn PRF extension can derive `nsk`. The SDK does not call WebAuthn itself: the application runs the assertion with `LELANTOS_PRF_SALT` as the PRF input and passes the output to `deriveNskFromPasskey`. Pass the result as `nsk`.

```ts twoslash
// ---cut-start---
import type { Eip1193ProviderLike } from "@lelantos-org/sdk";
declare function assertWithPrf(salt: Uint8Array): Promise<Uint8Array>;
declare const provider: Eip1193ProviderLike;
declare const address: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect, deriveNskFromPasskey } from "@lelantos-org/sdk";

const nsk = await deriveNskFromPasskey({
    // Run `navigator.credentials.get` with `extensions: { prf: { eval: { first: salt } } }`
    // and return the 32 bytes of `getClientExtensionResults().prf.results.first`.
    evaluatePrf: (salt) => assertWithPrf(salt),
});

const wallet = await connect({ network: "base", rpcUrl, nsk, provider, address });
```

| Property | Detail |
|---|---|
| Salt | `LELANTOS_PRF_SALT` from `@lelantos-org/sdk/primitives`, a fixed 32-byte value; pass it as `prf.eval.first` |
| Output | exactly 32 bytes; other lengths raise `INVALID_ARGUMENT` |
| Determinism | the same credential always yields the same `nsk` |
| Standalone derivation | `prfOutputToNsk(prf)` from `@lelantos-org/sdk/primitives` reduces a PRF output without running the ceremony |

::: danger The passkey is the only backup
A passkey-derived wallet has no mnemonic. If the user loses the credential, the funds cannot be recovered. Inform users before creating a passkey wallet, or offer an additional backup such as exporting `nsk`.
:::

### Type-checked groups

Each group is an exclusive union: two key sources, or two chain layers, do not compile. A `readOnly`, `reader`, or `chain` layer without a key source does not compile either, because it holds no key to derive one from.

```ts twoslash
// @errors: 2322
import { connect, generateMnemonic } from "@lelantos-org/sdk";
const mnemonic = generateMnemonic({ words: 24 });
const rpcUrl = "https://base-rpc.example.com";
const privateKey: `0x${string}` = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// ---cut---
// Two chain layers: `privateKey` and `readOnly`.
await connect({ network: "base", rpcUrl, mnemonic, privateKey, readOnly: true });
```

## Capabilities

`wallet.capabilities` is fixed at connect time from the configuration. A method whose flag is `false` stays on the interface and rejects with the code shown.

| Flag | `true` when | Otherwise |
|---|---|---|
| `prove` | a prover is configured (`prover` is not `"none"`) | spends reject `PROVER_UNAVAILABLE` |
| `deposit` | the chain layer signs as an EOA | deposits reject `NO_EVM_ACCOUNT` |
| `depositAllowance` | the adapter supports Permit2 batch allowances | `setupDepositAllowance` rejects `UNSUPPORTED_OPERATION` |
| `nativeDeposit` | the adapter can deposit through `NativeAdapter` | `deposit({ native: true })` rejects `UNSUPPORTED_OPERATION` |
| `nativeWithdraw` | a `NativeAdapter` address is known | `withdraw({ native: true })` rejects `UNSUPPORTED_OPERATION` |
| `swap` | `prove`, a submitter that relays swaps, and a quoter URL | `quoteSwap` and `swap` reject `UNSUPPORTED_OPERATION` |

## Prover

`prover` accepts a `ProverConfig`, a pre-built `Prover`, or `"none"`.

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl,
    privateKey,
    prover: {
        warmup: "lazy", // default: nothing is fetched until the first proof
        backend: "auto", // wasm, falling back to snarkjs
    },
});

// Start the ~50 MB artifact download now, for example while the user fills a form.
await wallet.warmProver();
```

| `ProverConfig` field | Default | Description |
|---|---|---|
| `artifacts` | `@lelantos-org/circuits` on Node; none in a browser | `{ circuit, zkey }` URLs or paths |
| `cdn` | — | base URL serving `<shape>.wasm` and `<shape>_final.zkey` |
| `warmup` | `"lazy"` | `"eager"` starts fetching and warming in the background once connected |
| `backend` | `"auto"` | `"wasm"` or `"snarkjs"` to force one |
| `worker` | — | a factory for a proving Web Worker — see [Browser usage](/guide/browser#keeping-the-main-thread-free) |
| `threads` | runtime concurrency | prover thread count |

Artifact problems surface at the first proof or `warmProver()`, not at `connect`. An application that only reads balances never downloads the prover. `prover: "none"` makes that explicit: `capabilities.prove` is `false` and spends reject `PROVER_UNAVAILABLE`.

## HTTP options

`http` is forwarded to the relayer, FMD, and quoter clients.

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
declare const proxiedFetch: typeof fetch;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl,
    privateKey,
    http: {
        fetch: proxiedFetch, // route every SDK request through your own transport
        timeoutMs: 10_000, // per attempt, reads and estimates
        submitTimeoutMs: 60_000, // per attempt, spend submissions
        retries: 2,
        headers: { "x-api-key": "…" },
        onRetry: ({ service, url, attempt, delayMs }) => console.warn(service, url, attempt, delayMs),
    },
});
```

Submissions retry only when no response arrived, or on `429` and `503`, under one idempotency key. See [Timeouts and retries](/guide/errors#timeouts-and-retries).

## Storage

`storage` holds the three persistence backends. Each defaults to memory, which re-downloads and re-scans on every start.

```ts twoslash
// ---cut-start---
import type { NoteStore, NullifierPersistence, TreePersistence } from "@lelantos-org/sdk/advanced";
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
declare const notes: NoteStore;
declare const tree: TreePersistence;
declare const nullifiers: NullifierPersistence;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl,
    privateKey,
    storage: { notes, tree, nullifiers },
});
```

See [Custom storage](/guide/storage) and [Persisting the tree and spent set](/guide/sync#persisting-the-tree-and-spent-set).

## `createWallet()` — full control

`createWallet(source, config)` from `@lelantos-org/sdk/advanced` takes a `KeySource` and an explicit `WalletConfig`. It resolves no network preset and accepts every pluggable, including those `connect` does not expose (`submitter`, `selector`, `noteSource`, `feeBps`).

```ts twoslash
// ---cut-start---
import type { ChainReader } from "@lelantos-org/sdk/advanced";
declare const chain: ChainReader;
// ---cut-end---
import { createWallet } from "@lelantos-org/sdk/advanced";

const wallet = await createWallet(
    // `KeySource` is a discriminated union on `type`.
    { type: "mnemonic", mnemonic: "…", account: 0 },
    {
        chainId: 8453n,
        treeDepth: 10,
        relayerAddress: "0x0000000000000000000000000000000000000002",
        chain,
        fmdUrl: "https://fmd.my-deployment.example",
        relayerUrl: "https://relayer.my-deployment.example",
        prover: { artifacts: { circuit: "./4x6.wasm", zkey: "./4x6_final.zkey" } },
    },
);
```

| Field | Required |
|---|---|
| `chainId`, `treeDepth`, `relayerAddress`, `chain` | always |
| `fmdUrl` | unless `noteSource` is set |
| `relayerUrl` | unless `submitter` is set |

::: warning `treeDepth` must match the deployment
The value must equal the depth of the deployed contract and circuit. A mismatch produces no local error; the proof fails verification on chain.
:::

See [Pluggable interfaces](/guide/interfaces) for every configurable component.

## Disposing a wallet

`dispose()` terminates the scanner and prover workers the wallet created. Every other method then rejects with `UNSUPPORTED_OPERATION`; `state()` reports `disposed: true`. Calling it twice is safe.

The SDK disposes only what it built. A pool from `scanner: { workers }` and a prover from a `ProverConfig` belong to the wallet. A `Prover` or `Scanner` instance you pass to `connect` or `createWallet` belongs to you: `dispose()` leaves it running, so it can be shared across wallets, and you release it. Storage backends are never closed by the SDK.

Call `dispose()` before replacing a wallet, for example on an account or network switch. A worker-pool scanner holds several workers with separate WASM heaps, and they are not released otherwise. The wallet also implements `Symbol.asyncDispose`:

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

{
    await using wallet = await connect({ network: "base", rpcUrl, privateKey });
    await wallet.sync();
} // disposed here
```

## Next

- [Networks](/guide/networks) — built-in presets and custom deployments
- [Amounts and assets](/guide/amounts)
- [Addresses](/guide/addresses)
