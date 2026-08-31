# Syncing

A note is not spendable until the wallet holds three things: the note itself, the Merkle tree that contains it, and the nullifier set that says whether it has already been spent. `sync()` fetches all three.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
const r = await wallet.sync({ limit: 1000 });
//    ^?
```

`sync()` pulls encrypted notes, trial-decrypts each with the wallet's `ivk`, and persists the hits to the `NoteStore`. Notes, tree, and spent-nullifier set are fetched in parallel, then the local notes are reconciled against the nullifiers.

Split the call when you only need one part:

| Call | When to use it |
|---|---|
| `syncNotes()` | enough for a balance display |
| `syncTree()` | **required before spending** — the proof is against a tree root |
| `syncNullifiers()` | refreshes the local spent set |

`syncNullifiers()` is on the concrete `Wallet` class rather than the `WalletApi` interface; code typed against `WalletApi` reaches it through `sync()`.

::: tip Why the spent set is mirrored in full
Asking a server "is nullifier N spent?" would name a note you own. The whole set is mirrored instead. Persist both mirrors to avoid re-downloading them on every page load — see [Persisting the tree and spent set](#persisting-the-tree-and-spent-set).
:::

## Reading progress, and stopping early

`onProgress` reports the phase and running counts; `signal` stops paging at the next page boundary. Aborting is safe: whatever was scanned before the abort is checkpointed, so the next sync resumes from there rather than rescanning.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
const ac = new AbortController();
setTimeout(() => ac.abort(), 30_000); // give up after 30s, keeping progress

const result = await wallet.sync({
    limit: 1000,
    signal: ac.signal,
    onProgress: (p) => console.log(p.phase, p.fetched, p.hits),
});

if (result.stoppedBy !== "exhausted") {
    // "aborted" | "pageCap" | "cursorStalled" — the feed did not run to the end.
    console.warn("sync did not complete:", result.stoppedBy);
}
```

`stoppedBy: "exhausted"` is the only healthy outcome. The others are reported rather than logged and forgotten, so a caller can distinguish "caught up" from "gave up".

## Waiting for your own transaction to appear

After a successful broadcast the indexer still has to pick the transaction up. `awaitCommitments` polls until the commitments you care about are in the local store, and returns a status rather than throwing — a slow indexer is not a failed transaction.

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
const tx = await wallet.transfer({ to, amount: 100n });

// Only this wallet's own outputs will ever land in its own store.
const seen = await wallet.awaitCommitments(tx.ownCommitments, { pollMs: 2000, maxAttempts: 30 });

if (seen.status !== "seen") console.warn("indexer behind:", seen.missing.length, "missing");
```

## Polling cheaply

`sync()` is expensive: it pages the note feed, folds the tree, and mirrors the spent set. `FmdClient.fetchHead()` is the cheap question that says whether any of that is worth doing — two indexed `MAX()`s, uncached on both sides, small enough to poll every few seconds.

```ts twoslash
// ---cut-start---
const fmdUrl = "https://fmd.lelantos.xyz";
const chainId = 1n;
// ---cut-end---
import { FmdClient } from "@lelantos-org/sdk/fmd-server";

const fmd = new FmdClient(fmdUrl, chainId);
const head = await fmd.fetchHead();
//    ^?
```

## Persisting the tree and spent set

Both mirrors are rebuilt from scratch on every fresh wallet, which is wasted bandwidth in any application that outlives a single process. Pass a `treePersistence` and a `nullifierPersistence`: the SDK restores state at startup and saves after each sync.

Each is a small interface over any storage you like: `load` and `save`, plus a `clear` on `TreePersistence` so a tree that has gone wrong can be discarded and rebuilt. The spent set has no equivalent — it only ever grows, so there is nothing to discard.

```ts twoslash
// ---cut-start---
declare function idbGet(k: string): Promise<string | undefined>;
declare function idbSet(k: string, v: string): Promise<void>;
declare function idbDel(k: string): Promise<void>;
// ---cut-end---
import type {
    NullifierPersistence,
    NullifierStoreState,
    TreePersistence,
    TreeStoreState,
} from "@lelantos-org/sdk";

// bigint is not JSON-serialisable, so encode explicitly rather than relying
// on a replacer somewhere up the call stack.
const enc = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
const dec = (s: string) =>
    JSON.parse(s, (_k, x) => (typeof x === "string" && /^\d+n$/.test(x) ? BigInt(x.slice(0, -1)) : x));

class IdbTreePersistence implements TreePersistence {
    async load(): Promise<TreeStoreState | null> {
        const raw = await idbGet("lelantos-tree");
        return raw ? (dec(raw) as TreeStoreState) : null;
    }
    async save(state: TreeStoreState): Promise<void> {
        await idbSet("lelantos-tree", enc(state));
    }
    // Required, not optional. `TreeStore.reset()` repairs a bad tree by
    // discarding it and rebuilding; a backend that cannot forget would restore
    // the discarded tree on the next `load()`, leaving the wallet to pay the
    // rebuild on every spend and only ever log a warning.
    async clear(): Promise<void> {
        await idbDel("lelantos-tree");
    }
}

class IdbNullifierPersistence implements NullifierPersistence {
    async load(): Promise<NullifierStoreState | null> {
        const raw = await idbGet("lelantos-nullifiers");
        return raw ? (dec(raw) as NullifierStoreState) : null;
    }
    async save(state: NullifierStoreState): Promise<void> {
        await idbSet("lelantos-nullifiers", enc(state));
    }
}
```

Pass them to `connect()`:

```ts twoslash
// ---cut-start---
import { connect, type NullifierPersistence, type TreePersistence } from "@lelantos-org/sdk";
declare const IdbTreePersistence: new () => TreePersistence;
declare const IdbNullifierPersistence: new () => NullifierPersistence;
// ---cut-end---
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
    treePersistence: new IdbTreePersistence(),
    nullifierPersistence: new IdbNullifierPersistence(),
});
```

::: tip Persist `nodes` as well as `leaves`
`TreeStoreState.nodes` holds the memoized internal Merkle nodes. A state saved without them still restores — it just pays a full rebuild, roughly 350K hashes, on the first `root()` or `getPath()` after startup. Serialising whatever `save` was handed keeps them.
:::

`treeStore` and `nullifierStore` replace the stores outright and are the escape hatch for a shared or pre-seeded cache. For persistence alone, use the `*Persistence` options — they are ignored when the corresponding store is supplied directly.

::: warning Use the same `treeDepth` everywhere
A local tree built at a different depth than the circuit expects produces paths and a root of that depth. Nothing errors — the proof simply fails to verify on chain. `connect()` takes the depth from the network preset, so this only bites when hand-building a `WalletConfig`.
:::

## Sync strategies

Two strategies, set through `WalletConfig.syncStrategy`. The choice selects the default `NoteSource`, and is ignored when `noteSource` is set directly.

| Strategy | Endpoint | FMD runs | Anonymity | Bandwidth |
|---|---|---|---|---|
| `{ kind: "full" }` (default) | `/v1/notes` (firehose) | skipped | **maximum** — no detection key leaves the wallet | every encrypted note |
| `{ kind: "matches", token }` | `/v1/matches` | server-side, via a registered subscription | reduced — the server learns the FMD-positive subset | only the false-positive subset |

::: danger Delegating detection is one-way and permanent
The scalars you POST are `x_i = dk + h_i` over a publicly computable `h_i`, so **the server recovers your root FMD secret `dk`** and keeps the ability to detect your incoming notes at any γ, forever.

Rotating the subscription token does not revoke it. Only a new `nsk` does. This is why `full` is the default.
:::

### Registering a subscription

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
import type { SpendingKey, ViewingKey } from "@lelantos-org/sdk/keys";
declare const pk: `0x${string}`;
declare const rpcUrl: string;
declare const fmdUrl: string;
declare const chainId: bigint;
declare const keys: SpendingKey;
declare const viewingKey: ViewingKey;
declare const myAppConfig: { subscriptionEpoch?: number };
// ---cut-end---
import { detectionKey } from "@lelantos-org/sdk";
import { cryptoContext, deriveSubscriptionToken } from "@lelantos-org/sdk/crypto";
import { FMD_SENDER_GAMMA, detectionKeyToHex, subscriptionTokenToHex } from "@lelantos-org/sdk/fmd";
import { FmdClient } from "@lelantos-org/sdk/fmd-server";

// `epoch` is 0 until you rotate.
const { P } = await cryptoContext();
const epoch = BigInt(myAppConfig.subscriptionEpoch ?? 0);
const tokenHex = subscriptionTokenToHex(deriveSubscriptionToken(P, keys.ivk, epoch));
const detectionKeyHex = detectionKeyToHex(await detectionKey(viewingKey, FMD_SENDER_GAMMA));

const fmd = new FmdClient(fmdUrl, chainId);
await fmd.createSubscription({ detectionKeyHex, gamma: FMD_SENDER_GAMMA, tokenHex });

const matches = await connect({
    privateKey: pk,
    network: "anvil",
    rpcUrl,
    syncStrategy: { kind: "matches", token: tokenHex },
});
```

::: warning Derive the token from `ivk`, never from `dk` or the detection key
The γ detection scalars are `x_i = dk + h_i` over an `h_i` anyone can compute from the public `ck`, so the server you hand them to can invert back to `dk`. A token built from either would be forgeable by that server.
:::

At the default epoch there is nothing extra to persist: `deriveSubscriptionToken(P, ivk)` regenerates the token from a secret the wallet already holds, and re-registering re-attaches to the same subscription (`created: false`) rather than duplicating it and re-running the backfill.

## Rotating a subscription token

Pass a new `epoch` to rotate. The token is a bearer credential sent on every poll and is stable across sessions, machines, and IPs — a pseudonymous identifier for the wallet. It travels in an `Authorization` header, which keeps it out of proxy and browser-history logs, but a credential with no rotation path has no recovery from a leak by any other route.

Once you rotate, **the epoch must be stored** — it is no longer derivable.

## Next

- [Note management](/guide/notes)
- [Custom storage](/guide/storage) — persisting the notes themselves
- [Concepts](/guide/concepts) — what FMD is doing
