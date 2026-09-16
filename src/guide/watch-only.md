# Watch-only wallets

A viewing key gives read access to a shielded account without the ability to spend. A watch-only wallet created from one supports sync, notes, balances, and state; spending methods are absent from its type.

Use cases include balance displays on devices that must not hold spending keys, access for accountants and auditors, and monitoring services.

## Key hierarchy

The spending key `nsk` derives every other key:

```
nsk ─┬─ ivk ─┬─ pk    binds the note commitment
     │       ├─ pk_d  ECDH target, decrypts incoming notes
     │       └─ dk    FMD detection secret
     └─ nk           derives nullifiers
```

| Key | Reads incoming notes | Knows which notes are spent | Can spend |
|---|---|---|---|
| **Incoming viewing key** (`lelantosivk1…`) | yes | no | no |
| **Full viewing key** (`lelantosfvk1…`) | yes | yes | no |
| Spending key | yes | yes | yes |

A full viewing key adds `nk`, which computes nullifiers. `nk` derives from `nsk`, not `ivk`, so an incoming viewing key cannot be upgraded to a full viewing key.

::: warning An incoming viewing key reports received totals
Without `nk` the wallet cannot tell spent notes from unspent ones. With an incoming viewing key, balances are the total ever received, not the current balance. Check `spentKnown`.
:::

::: danger Viewing keys cannot be revoked
A viewing key is fixed by `nsk`. Its holder can decrypt every past and future note received by the account. The only way to end that access is to move funds to a new account.
:::

## Exporting a key

A spending wallet exposes both encodings on `keys`. Neither contains `nsk`.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const ivk = wallet.keys.viewingKey; // "lelantosivk1…": incoming notes only
const fvk = wallet.keys.fullViewingKey; // "lelantosfvk1…": also settles which notes are spent
```

Both are bech32m; the prefix identifies the tier. To encode a raw key object instead, use `encodeViewingKey` or `encodeFullViewingKey` (both root); `isFullViewingKey` narrows what `decodeViewingKey` returns.

## Creating a watch-only wallet

`connectWatch` lives on its own subpath, so a viewer's bundle never reaches the prover, the relayer submitter, or the coin selector.

```ts twoslash
// ---cut-start---
declare const fvk: string;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";
import { connectWatch } from "@lelantos-org/sdk/watch";

await using watch = await connectWatch({
    network: "base",
    rpcUrl: "https://base-rpc.example.com", // for asset metadata; omit to read notes only
    viewingKey: fvk,
});

await watch.sync();

watch.address; // the account being watched, derived from the key
watch.spentKnown; // true for a full viewing key, false for an incoming one
watch.keys.tier; // "full" | "incoming"

const usdc = await watch.balance("USDC");
console.log(formatAmount(usdc.total, usdc.asset, { symbol: true }));
```

`connectWatch` returns a `ReadOnlyWalletApi` (exported from the root). It accepts an encoded key of either tier, or a decoded `ViewingKey` / `FullViewingKey`; the tier is detected from the key.

| Option | Description |
|---|---|
| `network`, `rpcUrl` | as for `connect`; `rpcUrl` is optional here |
| `viewingKey` | either tier, encoded or decoded |
| `reader` | a pre-built `ChainReader` for asset metadata, instead of `rpcUrl` |
| `scanner`, `http`, `denominations`, `wasm`, `runtime` | as for `connect` |
| `storage` | `{ notes?, nullifiers? }`; a watch wallet has no tree |
| `syncStrategy` | default `full`; `matches` also requires `allowDetectionKeyRelease: true` |

Without `rpcUrl` or `reader`, no RPC is contacted: `sync`, `notes`, and `state` work, while `asset`, `assets`, and `balance` reject `WALLET_CONFIG`. `state().balances` still reports unspent totals per asset id.

For explicit configuration, `createWatchWallet(key, config)` in `@lelantos-org/sdk/advanced` is the counterpart of `createWallet`.

## Differences from a spending wallet

| | Spending wallet | Watch-only wallet |
|---|---|---|
| Entry point | `connect` from `@lelantos-org/sdk` | `connectWatch` from `@lelantos-org/sdk/watch` |
| Returns | `WalletApi` | `ReadOnlyWalletApi` |
| Spend and quote methods | present | absent from the type (compile-time error) |
| Prover, submitter, coin selector | loaded on demand | not in the module graph |
| Merkle tree | synced with `scope: "full"` | never synced; every sync is `"notes"` |
| Chain access | required | optional; needed only for asset metadata and `balance` |
| `matches` sync strategy | allowed | requires `allowDetectionKeyRelease: true` |

A watch-only wallet requires `allowDetectionKeyRelease: true` for the `matches` strategy because registering a detection key permanently exposes the **owner's** incoming notes to the server. That decision belongs to the account owner, not the viewer. See [Sync strategies](/guide/sync#sync-strategies).

## Next

- [Syncing](/guide/sync)
- [Balances and state](/guide/state)
- [Addresses](/guide/addresses)
