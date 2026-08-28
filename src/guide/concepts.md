# Concepts

Enough of the model to read the rest of these docs. Using the SDK does not require the cryptography, but it does require these four ideas — each of them explains an API that would otherwise look arbitrary.

## Notes

The pool does not track balances. It tracks **notes** — individual commitments, each holding an asset and a value, each owned by one address.

Your balance is the sum of your unspent notes. This is why [note selection](/guide/notes) exists at all: spending 100 means finding notes that cover 100, not decrementing a number.

A transaction consumes up to four notes and creates new ones. Change comes back to you as a fresh note.

Two consequences show up immediately in the API. A balance spread across more notes than one transaction can consume is not fully spendable in one go — which is why [`spendableMax()`](/guide/notes) exists and `balance()` is not a safe maximum. And a spend that finds no covering set fails with `InsufficientCoverError` rather than sending less.

## Nullifiers

Spending a note publishes a **nullifier** — a value derived from the note that reveals nothing about which note it was, but which the pool can check for uniqueness.

That is what prevents double-spending without revealing the spend graph. It is also why the wallet mirrors the whole nullifier set locally: asking a server *"is nullifier N spent?"* would identify a note you own.

## The Merkle tree

Every note commitment goes into an append-only Merkle tree. To spend a note you prove, in zero knowledge, that it is *somewhere* in that tree — without saying where.

The proof is against a specific tree root, so **the wallet must have a current tree before it can spend**. That is what `syncTree()` is for, and why a freshly deposited note is not immediately spendable: the relayer has to fold it in first. See [Deposit](/guide/deposit).

## Fuzzy message detection (FMD)

A note is encrypted to its recipient. Nothing on chain says who that is — so how does a wallet find its own notes?

The default answer is brute force: download every encrypted note and trial-decrypt each one. Maximum privacy, maximum bandwidth. That is the `full` sync strategy.

**FMD** is the alternative. Each note carries a *clue*, and a detection key can test a clue for a probabilistic match — returning your notes plus a tunable rate of false positives. Handing that key to a server means downloading far less.

::: danger Delegating detection is permanent
The detection scalars let the server recover your root FMD secret. It can detect your incoming notes forever, and rotating the subscription token does not revoke it. This is why `full` is the default. See [Syncing](/guide/sync).
:::

## Putting it together

A transfer therefore means: pick notes that cover the amount, prove they are in the tree, publish their nullifiers, create new commitments for payee and change, and attach clues so the payee can find theirs.

The [Wallet API](/guide/wallet) does all of that in one call. The rest of this guide is mostly about the seams — what to do when a step fails, and where to substitute your own implementation.

## Next

- [Quickstart](/guide/quickstart)
- [Syncing](/guide/sync) — the tree and the spent set in practice
- [Architecture](/guide/architecture) — how the code is layered
