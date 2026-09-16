# Concepts

The SDK hides the cryptography, but four concepts determine how its API behaves.

## Notes

The pool does not store balances. It stores **notes**: commitments that each hold one asset, one value, and one owner.

- A balance is the sum of unspent notes.
- A spend consumes up to four notes and creates new ones. Change returns as a new note.
- A balance spread across more than four notes cannot be spent in one transaction. `balance()` is therefore not the maximum spendable amount; use [`spendableMax()`](/guide/notes#what-a-single-spend-can-reach).
- When no set of notes fits the input slots, a spend throws `INSUFFICIENT_COVER` instead of sending less.

## Nullifiers

Spending a note publishes its **nullifier**, a value derived from the note. The pool rejects a nullifier it has already seen, which prevents double spends. A nullifier does not reveal which note it belongs to.

The wallet downloads the full nullifier set and checks it locally. Querying a server for a specific nullifier would reveal a note the wallet owns.

## The Merkle tree

Every note commitment is appended to a Merkle tree. A spend proves in zero knowledge that its input notes are in the tree, without revealing their positions.

The proof is built against a specific tree root, so the wallet needs a current copy of the tree before it spends. This is why `sync()` defaults to `scope: "full"` on a spending wallet, and why a new deposit is not spendable until the relayer has added it to the tree. See [Deposit](/guide/deposit#the-deposit-lifecycle).

## Note detection (FMD)

Notes are encrypted to their recipient, and nothing on chain identifies the recipient. A wallet finds its notes in one of two ways:

| Strategy | How it works | Trade-off |
|---|---|---|
| `full` (default) | download every encrypted note and trial-decrypt locally | no information leaves the wallet; highest bandwidth |
| `matches` | register a detection key with the FMD server, which returns probable matches plus false positives | lower bandwidth; the server can detect the wallet's incoming notes |

::: danger Delegating detection cannot be revoked
The detection key registered for `matches` lets the server recover the wallet's root FMD secret. The server can detect incoming notes permanently; rotating the subscription token does not revoke this. See [Sync strategies](/guide/sync#sync-strategies).
:::

## How a transfer uses them

1. Select notes that cover the amount.
2. Prove the notes are in the tree.
3. Publish their nullifiers.
4. Create commitments for the payee, the change, and the relayer fee.
5. Attach FMD clues so recipients can detect their notes.

`wallet.transfer()` performs all five steps. The rest of this guide covers configuration, failure handling, and replacing individual components.

## Next

- [How it fits together](/guide/system) — the contracts and services the SDK talks to
- [Glossary](/guide/glossary) — definitions of keys, units, and protocol terms
- [Syncing](/guide/sync)
