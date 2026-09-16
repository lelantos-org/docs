# Balances and state

A wallet exposes what it knows two ways: `balance(asset)`, an async read that splits one asset's value by what a spend can reach, and `state()`, a synchronous immutable snapshot for rendering without polling.

## Balance

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

await wallet.sync({ scope: "notes" });
const b = await wallet.balance("USDC");
//    ^?

formatAmount(b.total, b.asset, { symbol: true }); // every unspent note
formatAmount(b.spendable, b.asset); // what one spend can cover, with no fee reserved
b.withheld; // { reserved, cooldown, dust, slots }
b.syncedAt; // undefined before the first sync
```

The figures always add up:

```
total = spendable + withheld.reserved + withheld.cooldown + withheld.dust + withheld.slots
```

| `withheld` | Cause | Resolves |
|---|---|---|
| `reserved` | leased by a spend in flight, or held after a submission with an unknown outcome | when the spend settles, or the reservation expires |
| `cooldown` | received too recently | after the spend cooldown, as blocks arrive |
| `dust` | below the dust threshold | no; excluded by configuration |
| `slots` | beyond the circuit's input arity | only by [consolidating](/guide/notes#consolidating-explicitly) |

`spendable` reserves nothing for the relayer fee. For the maximum of a specific operation, call `spendableMax(asset, { kind, feeAsset })`; see [What a single spend can reach](/guide/notes#what-a-single-spend-can-reach).

`balance` resolves the asset against the chain, so a watch-only wallet needs `rpcUrl` or a `reader` to call it. On a wallet whose viewing key cannot see spends (`spentKnown: false`), `total` is everything ever received.

## State snapshot

`state()` returns a `WalletState`: an immutable object that stays the same instance until something changes.

| Field | Contents |
|---|---|
| `version` | increments on every change |
| `sync` | `status` (`"idle"` \| `"syncing"`), `syncedAt`, `lastReport`, `lastError` |
| `notes` | `count` (spent included), `unspent`, `pendingSpend` |
| `balances` | `ReadonlyMap<AssetId, CircuitAmount>`: unspent total per asset, without the async split |
| `ops` | operations in flight, oldest first: `{ opId, op, phase, startedAt }` |
| `disposed` | `true` after `dispose()` |

`state().balances` needs no RPC, so it also works on a watch-only wallet without a reader. Format it with an `AssetInfo` you already hold.

## Subscribing

`subscribe(listener)` calls the listener with each new snapshot after a change commits: a sync starting or finishing, notes added, spent, reserved or compacted, an operation starting, changing phase or settling, and dispose. Changes within one microtask are coalesced into one call. It is not called on subscribe, and it returns an idempotent unsubscribe.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const unsubscribe = wallet.subscribe((state) => {
    if (state.sync.lastError) console.warn("sync failing:", state.sync.lastError.code);
    for (const op of state.ops) console.log(op.op, op.opId, op.phase);
});

// later
unsubscribe();
```

A listener that throws is logged and swallowed.

### React

Methods are bound and `state()` returns a stable snapshot, so both plug directly into `useSyncExternalStore`:

```ts twoslash
// ---cut-start---
declare function useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T): T;
declare function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
// ---cut-end---
import type { AssetId, ReadOnlyWalletApi, WalletState } from "@lelantos-org/sdk";

export function useWalletState(wallet: ReadOnlyWalletApi): WalletState {
    return useSyncExternalStore(wallet.subscribe, wallet.state);
}

export function useUnspent(wallet: ReadOnlyWalletApi, asset: AssetId): bigint {
    const state = useWalletState(wallet);
    return useMemo(() => state.balances.get(asset) ?? 0n, [state, asset]);
}
```

`useSyncExternalStore(wallet.subscribe, wallet.state)` never loops: `state()` returns the same object between changes.

::: tip Rendering progress
`state().ops` lists every operation in flight with its latest phase, including ones started elsewhere in the app. A global activity indicator can read it instead of threading `onPhase` callbacks through components. Match an entry to a call with the `opId` you passed.
:::

## Next

- [Note management](/guide/notes)
- [Syncing](/guide/sync)
- [Watch-only wallets](/guide/watch-only)
