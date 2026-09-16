# Custom storage

The wallet persists three kinds of state, each through its own interface:

| State | Interface | `connect` option |
|---|---|---|
| decrypted notes and sync cursor | `NoteStore` | `storage.notes` |
| Merkle tree | `TreePersistence` | `storage.tree` |
| spent-nullifier set | `NullifierPersistence` | `storage.nullifiers` |

All three default to memory. A wallet without persistent storage re-downloads and re-scans the note feed on every start. The interfaces are in `@lelantos-org/sdk/advanced`.

This page covers `NoteStore`. For the tree and nullifier set, see [Persisting the tree and spent set](/guide/sync#persisting-the-tree-and-spent-set).

## Implementing `NoteStore`

`NoteStore` has two methods: `load()` returns the full notes file, and `save()` replaces it.

```ts twoslash
// ---cut-start---
declare function idbGet(k: string): Promise<string | undefined>;
declare function idbSet(k: string, v: string): Promise<void>;
// ---cut-end---
import type { NoteStore, NotesFile } from "@lelantos-org/sdk/advanced";

export class IndexedDbNoteStore implements NoteStore {
    async load(): Promise<NotesFile> {
        const json = (await idbGet("lelantos-notes")) ?? '{"version":1,"notes":[]}';
        return JSON.parse(json) as NotesFile;
    }

    async save(file: NotesFile): Promise<void> {
        await idbSet("lelantos-notes", JSON.stringify(file));
    }
}
```

`StoredNote` encodes `bigint` fields as decimal strings, so `NotesFile` serializes with plain `JSON.stringify`.

::: danger Persist `cursor`
`NotesFile.cursor` is the sync resume position. A store that drops it — for example by saving only `notes` — causes every sync to re-scan from the beginning, with no error. Save the whole object passed to `save()`.
:::

Pass the store when connecting:

```ts twoslash
// ---cut-start---
import type { NoteStore } from "@lelantos-org/sdk/advanced";
declare const IndexedDbNoteStore: new () => NoteStore;
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    network: "base",
    rpcUrl,
    privateKey,
    storage: { notes: new IndexedDbNoteStore() },
});
```

`createWallet` takes the same store as `noteStore`, and `connectWatch` as `storage.notes`. `InMemoryNoteStore` is the default implementation.

## Implementation requirements

| Requirement | Reason |
|---|---|
| Save the entire `NotesFile`, including `cursor` and `version` | a missing `cursor` forces a full re-scan; a missing `version` makes the wallet refuse to open |
| Make `save()` atomic (write to a temporary key, then rename; or use a transactional store) | a partially written file that fails to parse forces a full re-scan |
| Call `wallet.sync({ reload: true })` after modifying the store outside the SDK, such as from another tab | the wallet does not detect external changes |
| Encrypt the stored file | see [Contents](#contents) |

The SDK serializes its own reads and writes to the store, so `save()` is never called concurrently by one wallet.

## Schema version

The current `NotesFile` version is 1, which uses 16-byte note ids. The SDK does not upgrade files: opening a wallet whose store holds another version rejects `WALLET_CONFIG`. Clear the store (or have `load()` return an empty version-1 file) and the next sync re-scans the feed.

## Contents

The notes file contains the commitments the wallet owns, their values, and the sync cursor. It does **not** contain `nsk` or nullifiers; nullifiers are computed in memory and never written.

::: danger The notes file is sensitive
The file cannot be used to spend, but it links its holder to every commitment the wallet owns on chain. Encrypt it at rest.
:::

## Reducing file size

`wallet.compact()` removes notes already marked spent and returns the number removed. Balances are unchanged.

## Next

- [Syncing](/guide/sync)
- [Pluggable interfaces](/guide/interfaces)
