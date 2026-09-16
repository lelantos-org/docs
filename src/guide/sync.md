# Syncing

A note is spendable only when the wallet has three things locally: the note, the Merkle tree containing it, and the nullifier set showing whether it is spent. `sync()` fetches them.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const report = await wallet.sync();
//    ^?
```

`sync()` trial-decrypts the encrypted note feed with the wallet's viewing key, stores matches in the note store, pages the nullifier and commitment feeds, and marks notes whose nullifiers appear in the spent set. A second call while one is running queues behind it.

The tree and the nullifier set are downloaded in full, because asking a server for a specific path or nullifier would reveal which notes the wallet owns. To avoid downloading them on every start, [persist them](#persisting-the-tree-and-spent-set).

## Scope

| `scope` | Fetches | Use when |
|---|---|---|
| `"full"` (default on a spending wallet) | notes, spent set, and Merkle tree | before spending, or to warm the tree |
| `"notes"` | notes and spent set | displaying balances; a spend syncs the tree itself |

A watch-only wallet always syncs `"notes"`: it never builds a proof, so it has no tree. An incoming-viewing-key wallet also skips the spent set (`report.nullifiers` is absent).

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
await wallet.sync({ scope: "notes" }); // cheap refresh for a balance screen
await wallet.sync({ reload: true }); // re-read the note store first, after another tab wrote to it
```

## Progress and cancellation

`onProgress` reports each stream separately. `signal` stops paging at the next page boundary; progress made before the abort is saved, the call rejects with `signal.reason`, and the next sync resumes.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const report = await wallet.sync({
    signal: AbortSignal.timeout(30_000),
    pageSize: 1000,
    onProgress: (p) => {
        if (p.stream === "notes") console.log("notes", p.phase, p.fetched, p.hits);
        else console.log(p.stream, "chunk", p.chunkId, p.syncedCount);
    },
});

if (report.notes.stoppedBy !== "exhausted") {
    console.warn("the note feed did not run to its end:", report.notes.stoppedBy);
}
```

| `SyncReport` field | Contents |
|---|---|
| `notes` | `fetched`, `hits`, `added`, `skipped`, `pages`, `cursor`, `stoppedBy` |
| `tree` | tree chunk summary; present for `scope: "full"` |
| `nullifiers` | spent-set chunk summary; absent without a full viewing key |
| `syncedAt` | when this sync finished |

| `notes.stoppedBy` | Meaning |
|---|---|
| `"exhausted"` | the feed was read to the end; the wallet is up to date |
| `"cursorStalled"` | the feed returned a page without advancing the cursor; the note source is misbehaving |
| `"pageCap"` | the per-sync page limit was reached; the note source is misbehaving |

A failed sync rejects with its error and records it in `state().sync.lastError` until the next success. See [Balances and state](/guide/state).

## Waiting for a transaction to be indexed

After a transaction lands, the indexer must process it before `sync()` returns its notes. `awaitCommitments` syncs (scope `"notes"`) until the given commitments are in the local store. It resolves a status instead of throwing on timeout.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
// ---cut-end---
const tx = await wallet.transfer({ asset: "USDC", amount: "10", recipient });

// Only this wallet's own outputs will ever land in its own store.
const seen = await wallet.awaitCommitments(tx.ownCommitments, { timeoutMs: 60_000, pollMs: 2_000 });

if (seen.status !== "seen") console.warn(seen.status, seen.missing.length, "missing");
```

| Option | Default |
|---|---|
| `timeoutMs` | 120,000 ms |
| `pollMs` | 2,000 ms |
| `pageSize` | the feed's page size |
| `throwOnTimeout` | `false`; `true` rejects with `FMD_TIMEOUT` |
| `signal` | resolves `"aborted"` when fired |

Pass `ownCommitments`: only outputs the wallet can decrypt ever reach its store. For a deposit, `awaitDeposit(result.escrow)` is the same call on the escrow's commitment.

## Checking for new data

`FmdClient.fetchHead()` from `@lelantos-org/sdk/services` returns the indexer's latest positions in one inexpensive request. Poll it and sync only when the head has advanced.

```ts twoslash
import { FmdClient } from "@lelantos-org/sdk/services";

const fmd = new FmdClient("https://fmd.lelantos.xyz", 8453n);
const head = await fmd.fetchHead();
//    ^?
```

## Persisting the tree and spent set

By default the tree and nullifier set are kept in memory and rebuilt on every start. Pass `storage.tree` and `storage.nullifiers` to restore them at startup and save them after each sync.

| Interface | Methods |
|---|---|
| `TreePersistence` | `load`, `save`, `clear` |
| `NullifierPersistence` | `load`, `save` |

`clear` lets the wallet discard a corrupt tree and rebuild it. The nullifier set only grows, so it has no `clear`.

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
} from "@lelantos-org/sdk/advanced";

// bigint is not JSON-serialisable, so encode explicitly rather than relying
// on a replacer somewhere up the call stack.
const enc = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
const dec = (s: string) =>
    JSON.parse(s, (_k, x) => (typeof x === "string" && /^\d+n$/.test(x) ? BigInt(x.slice(0, -1)) : x));

export class IdbTreePersistence implements TreePersistence {
    async load(): Promise<TreeStoreState | null> {
        const raw = await idbGet("lelantos-tree");
        return raw ? (dec(raw) as TreeStoreState) : null;
    }
    async save(state: TreeStoreState): Promise<void> {
        await idbSet("lelantos-tree", enc(state));
    }
    // Required. The wallet repairs a bad tree by discarding and rebuilding it; a backend
    // that cannot forget would restore the discarded tree on the next `load()`.
    async clear(): Promise<void> {
        await idbDel("lelantos-tree");
    }
}

export class IdbNullifierPersistence implements NullifierPersistence {
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
import type { NullifierPersistence, TreePersistence } from "@lelantos-org/sdk/advanced";
declare const IdbTreePersistence: new () => TreePersistence;
declare const IdbNullifierPersistence: new () => NullifierPersistence;
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl,
    privateKey,
    storage: {
        tree: new IdbTreePersistence(),
        nullifiers: new IdbNullifierPersistence(),
    },
});
```

::: tip Persist `nodes` as well as `leaves`
`TreeStoreState.nodes` contains cached internal Merkle nodes. A state saved without them still loads, but the first proof rebuilds them (about 350K hashes). Serialize the full state passed to `save`.
:::

Pre-built `TreeStore` and `NullifierStore` instances, for example to share a pre-seeded cache, are `createWallet` options in `@lelantos-org/sdk/advanced`. When either is set, the corresponding persistence option is ignored.

## Sync strategies

`syncStrategy` selects how the wallet finds its notes.

| Strategy | Endpoint | Detection | Privacy | Bandwidth |
|---|---|---|---|---|
| `{ kind: "full" }` (default) | `/v1/notes` | local trial decryption | no key material leaves the wallet | every encrypted note |
| `{ kind: "matches", token }` | `/v1/matches` | server-side, via a registered subscription | the server learns which notes match | matches and false positives only |

::: danger Delegating detection cannot be revoked
The registered detection scalars are `x_i = dk + h_i`, where `h_i` is public. The server can therefore recover the root FMD secret `dk` and detect the wallet's incoming notes permanently, at any false-positive rate.

Rotating the subscription token does not revoke this. Only a new `nsk` does.
:::

### Registering a subscription

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
declare const myAppConfig: { subscriptionEpoch?: number };
// ---cut-end---
import { connect, decodeViewingKey } from "@lelantos-org/sdk";
import {
    cryptoContext,
    deriveSubscriptionToken,
    detectionKey,
    detectionKeyToHex,
    FMD_DEFAULT_GAMMA,
    subscriptionTokenToHex,
} from "@lelantos-org/sdk/primitives";
import { FmdClient } from "@lelantos-org/sdk/services";

const { P, J } = await cryptoContext();
const viewingKey = decodeViewingKey(P, J, wallet.keys.viewingKey);

// `epoch` is 0 until you rotate.
const epoch = BigInt(myAppConfig.subscriptionEpoch ?? 0);
const tokenHex = subscriptionTokenToHex(deriveSubscriptionToken(P, viewingKey.ivk, epoch));
const detectionKeyHex = detectionKeyToHex(await detectionKey(viewingKey, FMD_DEFAULT_GAMMA));

const fmd = new FmdClient("https://fmd.lelantos.xyz", 8453n);
await fmd.createSubscription({ detectionKeyHex, gamma: FMD_DEFAULT_GAMMA, tokenHex });

const matching = await connect({
    network: "base",
    rpcUrl,
    privateKey,
    syncStrategy: { kind: "matches", token: tokenHex },
});
```

::: warning Derive the token from `ivk`
Do not derive the token from `dk` or the detection key. The server receiving the detection scalars can recover `dk`, and could forge a token derived from it.
:::

At epoch 0 nothing needs to be stored: `deriveSubscriptionToken(P, ivk)` regenerates the same token, and registering again returns the existing subscription (`created: false`).

### Rotating the token

The token is a bearer credential sent in the `Authorization` header of every poll. It is stable across sessions and devices, so it identifies the wallet to the server. Rotate it by passing a new `epoch`.

After rotating, **store the epoch**. It cannot be derived.

## Next

- [Balances and state](/guide/state)
- [Note management](/guide/notes)
- [Watch-only wallets](/guide/watch-only)
