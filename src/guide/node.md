# Node usage

`connect()` detects Node and configures the prover, scanner, and HTTP clients for it. This page covers the Node-specific settings: prover artifacts, threads, persistent storage, deposit events, and shutdown.

Node 24 or later is required. It provides the global `fetch` and Web Crypto APIs the SDK uses.

## Prover artifacts

The prover needs the circuit (`<shape>.wasm`) and proving key (`<shape>_final.zkey`); the default shape is `4x6`. They are resolved in this order:

| Order | Source |
|---|---|
| 1 | `prover: { artifacts }` on `connect()` |
| 2 | `LELANTOS_PROVER_ARTIFACTS_DIR` environment variable (used only if both files exist) |
| 3 | the `@lelantos-org/circuits` package |
| 4 | `prover: { cdn }` |

Resolution happens at the first proof or `wallet.warmProver()`, not at `connect()`. If none resolves, that call throws `PROVER_ARTIFACTS_MISSING`; its `tried` field lists every location checked.

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
        artifacts: { circuit: "./artifacts/4x6.wasm", zkey: "./artifacts/4x6_final.zkey" },
        warmup: "eager", // a long-running service pays the load once, at startup
    },
});
```

`@lelantos-org/circuits` is published to GitHub Packages; install it with the same registry setup as the SDK. See [Installation](/guide/installation).

A script that only reads balances can pass `prover: "none"`: nothing is loaded, and spends reject `PROVER_UNAVAILABLE`.

## Prover threads

The WASM prover parallelizes Groth16 across a thread pool built on `node:worker_threads`.

| Setting | Precedence |
|---|---|
| `prover: { threads }` on `connect()`, or `configureProverThreads(n)` from `@lelantos-org/sdk/prover` | highest; applied before the first proof |
| `LELANTOS_PROVER_THREADS` | used when neither is set |
| default | `os.availableParallelism()`, clamped to 2–32 |

`0` or `1` selects single-threaded proving.

```ts twoslash
import { configureProverThreads } from "@lelantos-org/sdk/prover";

configureProverThreads(8);
```

A proof blocks the calling thread while it runs, even with a thread pool. In a server that handles other requests concurrently, run wallet operations in a dedicated worker thread or process.

## Persistent storage

The SDK ships only in-memory stores. A Node process that restarts re-scans the note feed and rebuilds the tree unless you provide persistent implementations under `storage`:

| Option | Interface | Guide |
|---|---|---|
| `storage.notes` | `NoteStore` | [Custom storage](/guide/storage) |
| `storage.tree` | `TreePersistence` | [Syncing](/guide/sync#persisting-the-tree-and-spent-set) |
| `storage.nullifiers` | `NullifierPersistence` | [Syncing](/guide/sync#persisting-the-tree-and-spent-set) |

A file-backed store implements `load()` and `save()` over a JSON file. Write to a temporary file and rename it so that a crash cannot leave a partially written file.

## Deposit events

`wallet.awaitDeposit(result.escrow)` polls the indexer until a deposit is flushed and works on Node without extra setup. See [Waiting for the relayer](/guide/deposit#waiting-for-the-relayer).

`DepositStream` from `@lelantos-org/sdk/services` pushes flush events instead, but uses `EventSource`, which Node does not provide. Pass an `eventSourceFactory` that returns a compatible object; without it the constructor throws `ENVIRONMENT`.

## Shutdown

The wallet implements `Symbol.asyncDispose`, so `await using` disposes it at the end of the scope:

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

await using wallet = await connect({ network: "base", rpcUrl, privateKey });

await wallet.sync();
// `wallet.dispose()` runs when the scope exits.
```

| Component | Keeps the process alive |
|---|---|
| default prover thread pool | no; its threads do not hold the event loop |
| worker threads you create for a custom `Prover` or `Scanner` | yes, until you dispose that instance (`wallet.dispose()` does not) |

Call `dispose()` (or use `await using`) in scripts and before replacing a wallet in long-running processes.

## Logging

Configure logging from environment variables in scripts:

```bash
LELANTOS_LOG='lelantos:*' LELANTOS_LOG_LEVEL=debug node ./script.mjs
```

The variables take effect only when the script applies them with `loggingFromEnv()`. See [Logging](/guide/logging#configuration-from-environment-variables).

## Next

- [Custom storage](/guide/storage)
- [Browser usage](/guide/browser)
