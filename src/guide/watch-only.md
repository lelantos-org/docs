# Watch-only wallets

A viewing key lets someone read a shielded account without being able to spend from it. Import one and you get balances, notes and sync — the same reading surface a spending wallet has, with the spend half absent from the type.

This is what backs a balance display on a device that must never hold spend authority, read access for an accountant or auditor, and any dashboard or bot that reports on an account it cannot move funds out of.

## The two tiers

Spend authority is `nsk`. Everything below it is a strictly smaller capability:

```
nsk ─┬─ ivk ─┬─ pk    binds the note commitment
     │       ├─ pk_d  ECDH target, decrypts incoming notes
     │       └─ dk    FMD detection secret
     └─ nk           derives nullifiers
```

| | reads incoming notes | sees which notes are spent | spends |
|---|---|---|---|
| **Incoming viewing key** (`lelantosivk1…`) | yes | no | no |
| **Full viewing key** (`lelantosfvk1…`) | yes | yes | no |
| Spending key | yes | yes | yes |

The difference between the two tiers is `nk`, and `nk` derives from `nsk` rather than from `ivk` — so an incoming viewing key cannot be upgraded into a full one. Without `nk` there is no way to recompute a note's nullifier, and so no way to tell a spent note from a live one.

That has a consequence worth stating plainly: **an incoming viewing key's `balance()` is everything the account has ever received**, not what remains. `spentKnown` says which you are looking at.

::: danger Handing over a viewing key is permanent
There is no rotation and no revocation. `ivk` is fixed by `nsk`, so a holder can decrypt every note the account has ever received and every note it receives from here on. The only way to take the capability back is to move the funds to a new account. Treat it the way you would treat a full transaction history, because that is what it is.
:::

## Exporting

<!-- typecheck: skip -->
```ts
import { encodeViewingKey, encodeFullViewingKey, viewingKeyFromSpending, fullViewingKeyFromSpending } from "@lelantos-org/sdk";

// Reads incoming notes only.
const ivk = encodeViewingKey(viewingKeyFromSpending(wallet.keys));

// Also settles which notes are spent.
const fvk = encodeFullViewingKey(fullViewingKeyFromSpending(wallet.keys));
```

Both are bech32m, and the prefix names the tier. Neither carries `nsk`.

## Watching

<!-- typecheck: skip -->
```ts
import { connectWatch } from "@lelantos-org/sdk/watch";

await using watch = await connectWatch({ network: "anvil", viewingKey: fvk });

await watch.sync();

watch.address;              // the account being watched, derived from the key
watch.spentKnown;           // true for an FVK, false for an IVK
watch.balance(assetId(1n));
watch.notes({ spent: false });
```

`connectWatch` takes either tier, or an already-decoded `ViewingKey` / `FullViewingKey`. Which one it got is read off the key rather than passed as a flag, and surfaces as `spentKnown`.

For full control over the pluggable dependencies, `WatchWallet.create(key, cfg)` is the counterpart to `Wallet.create`.

## What it does not load

`@lelantos-org/sdk/watch` is a separate entry point rather than a flag on `connect()`, and that is the point of it. A watch wallet cannot sign anything, so its module graph contains no prover, no relayer submitter and no coin selector. It also keeps no Merkle tree: the tree exists to witness a spend, and skipping it removes the commitment-chunk download and the tree rebuild — by far the most expensive part of a cold sync.

The `deposit`, `transfer`, `withdraw` and `swap` methods are not merely disabled; they are absent from `ReadOnlyWalletApi`, so calling one is a compile error rather than a runtime throw.

## Asset metadata is optional

Balances and notes come from the local note cache and need no chain access. `chain` is therefore optional, and `asset()` / `assets()` are the only calls that need it — a viewer reporting circuit-unit amounts never has to reach an RPC.

## Sync strategy

A watch wallet defaults to the `full` note feed, and refuses a `matches` subscription unless you pass `allowDetectionKeyRelease: true`.

Registering a detection key is not a delegate's decision to make. The subscription posts the γ detection scalars, and the public `h` values mean any single one of them yields the account's root detection secret — permanently, for the *owner*, not for the viewer. See [Syncing](/guide/sync) for the mechanics.

## Next

- [Syncing](/guide/sync) — the note feed, detection keys, and what each strategy costs
- [Addresses](/guide/addresses) — the address a viewing key resolves to
