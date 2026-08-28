# Custom storage

The wallet keeps three pieces of state, and each persists separately:

| State | Interface | Configured with |
|---|---|---|
| decrypted notes | `NoteStore` | `noteStore` |
| Merkle tree | `TreePersistence` | `treePersistence` |
| spent-nullifier set | `NullifierPersistence` | `nullifierPersistence` |

All three default to memory. That is fine for a script and useless across page loads — a fresh wallet re-downloads and re-scans the entire note feed every time.

This page covers the note store. For the other two, see [Syncing](/guide/sync#persisting-the-tree-and-spent-set).

## Implementing `NoteStore`

Two methods. `load()` returns the whole file; `save()` replaces it.

```ts twoslash
// ---cut-start---
declare function idbGet(k: string): Promise<unknown>;
declare function idbSet(k: string, v: string): Promise<void>;
// ---cut-end---
import type { NoteStore, NotesFile } from "@lelantos-org/sdk";

class IndexedDbNoteStore implements NoteStore {
    async load(): Promise<NotesFile> {
        const json = ((await idbGet("lelantos-notes")) as string | undefined) ?? '{"version":2,"notes":[]}';
        return JSON.parse(json);
    }

    async save(file: NotesFile): Promise<void> {
        await idbSet("lelantos-notes", JSON.stringify(file));
    }
}
```

::: danger Round-trip `cursor`
`NotesFile.cursor` is the resume point for the note feed. A store that drops it — by rebuilding the object, or persisting only `notes` — turns every subsequent sync back into a full re-scan from zero, silently and with no error. The example above preserves it because it serialises the whole file.
:::

`StoredNote` encodes its bigints as decimal strings precisely so the file is plain JSON — no replacer or reviver is needed, and no `bigint` will reach `JSON.stringify` and throw.

Pass it when constructing the wallet:

```ts twoslash
// ---cut-start---
import { Wallet, type NoteStore, type WalletConfig, type KeySource } from "@lelantos-org/sdk";
declare const keySource: KeySource;
declare const config: WalletConfig;
declare const IndexedDbNoteStore: new () => NoteStore;
// ---cut-end---
const wallet = await Wallet.create(keySource, { ...config, noteStore: new IndexedDbNoteStore() });
```

The CLI's `FileNoteStore` is a working Node-side reference implementation.

## What the file does and does not contain

The notes file holds the commitments this wallet owns, their values, and the resume cursor. It does **not** hold `nsk`, and it does not hold nullifiers — those are derived in memory on each run and deliberately never written.

::: danger The file is sensitive even without keys
It links its holder to every on-chain commitment this wallet owns. What it withholds is the other half — nullifiers are the on-chain spend identifiers, so writing them would additionally link the holder to every spend. Encrypt the file at rest; a leaked file is a full transaction-graph disclosure for its owner, even though it cannot move funds.
:::

## Writes are serialised for you

`sync()`, `compact()`, `refresh()`, and every spend all read a snapshot and then await a store write. `NoteCache` serialises them internally, so two overlapping operations cannot interleave and lose one another's changes.

Your `save()` therefore never runs concurrently with itself. It does need to be **atomic against a crash**: a half-written file that fails to parse on the next `load()` costs a full rescan. Write to a temporary key and rename, or use a transactional store.

If something outside the SDK mutates the store, call `wallet.refresh()` to re-read it — the in-memory snapshot is not invalidated on its own.

## Keeping the file small

`wallet.compact()` drops notes already flagged spent and returns how many it removed. Balances are unaffected: it only shrinks what is on disk, and live notes and reconcile state are preserved.

## Next

- [Syncing](/guide/sync) — persisting the tree and the spent set
- [Pluggable interfaces](/guide/interfaces)
