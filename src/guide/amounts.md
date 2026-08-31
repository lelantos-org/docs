# Amounts and assets

Three integer spaces are in play, and confusing them is the most common integration bug. The SDK names them explicitly so the conversion is never implicit.

| Space | Example | Where it appears |
|---|---|---|
| human | `"1.5"` | what a user types, and what you render |
| token | `1500000000000000000n` | ERC-20 base units (`10 ** decimals`) |
| circuit | `1500n` | **every `bigint` a `Wallet` method takes or returns** |

The relationship is fixed per asset:

```
tokenUnits = circuitUnits * asset.scale * asset.index / RAY
```

`scale` exists because the pool's field elements are far narrower than 18 decimals. It is set per asset in the MASP registry, and it is not derivable from `decimals`.

`index` is a pool-managed yield index, RAY-scaled, and is exactly `RAY` on a pool with no yield mixin — where it cancels and the relation is the plain `circuitUnits * scale` it has always been.

## Resolving an asset

`wallet.asset(ref)` reads the registry entry and caches it. `symbol` and `decimals` are added when the chain adapter implements `tokenMeta`; without it, both stay `undefined` and human-unit conversion is not defined.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { formatAmount, minAmount, parseAmount } from "@lelantos-org/sdk";

const weth = await wallet.asset(1n);
// → { id: 1n, token: "0xC02a…", scale: 1000000000000000n, symbol: "WETH", decimals: 18,
//     depositBps: 0n, withdrawBps: 25n, index: RAY, yieldEnabled: false, ladder: [...] }

parseAmount("0.25", weth); // 250n — human → circuit
//  ^?

formatAmount(250n, weth, { symbol: true }); // "0.25 WETH" — circuit → human
minAmount(weth); // "0.001" — smallest expressible amount
```

Pass `{ refresh: true }` to bypass the cache after a registry change. `wallet.assets()` returns every asset registered on the chain, lowest id first — the list to populate an asset picker from.

### Three ways to name an asset

Every `asset` argument takes an `AssetRef`, classified before any registry lookup:

| You pass | Read as | Example |
|---|---|---|
| `bigint` or a numeric string | registry id | `1n`, `"1"` |
| a 20-byte `0x` string | ERC-20 token address | `"0xC02aaA39…"` |
| anything else | symbol | `"WETH"` |

A `0x` string that is not 20 bytes is rejected as a mistyped address rather than falling through to a symbol lookup. A symbol matching more than one registered asset raises `InvalidArgumentError`: two tokens may legitimately share a symbol, and guessing would send funds to whichever was registered first.

### Two ways to state an amount

Every `amount` argument takes an `AmountLike` — a `bigint` of exact circuit units, or a decimal `string` of human token units.

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
await wallet.transfer({ to, asset: "USDC", amount: "12.50" }); // human units
await wallet.transfer({ to, asset: "USDC", amount: 12_500_000n }); // circuit units
```

A `number` is rejected outright: it cannot represent a decimal amount exactly, and the failure would be silent.

## Why `parseAmount` throws

`parseAmount` throws rather than truncating when a value is finer-grained than one circuit unit. Silently rounding a user's amount down is worse than refusing it — the difference is unrecoverable once the note is created.

Use `minAmount(asset)` to tell the user what the smallest expressible amount actually is.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
declare const input: string;
// ---cut-end---
import { minAmount, parseAmount } from "@lelantos-org/sdk";

const weth = await wallet.asset(1n);

function validate(entered: string): { ok: true; amount: bigint } | { ok: false; error: string } {
    try {
        return { ok: true, amount: parseAmount(entered, weth) };
    } catch {
        return { ok: false, error: `Smallest amount is ${minAmount(weth)} ${weth.symbol ?? ""}` };
    }
}

validate(input);
```

## When `decimals` is unknown

Human-unit conversion is only defined for an asset whose `decimals` resolved, and a chain adapter without `tokenMeta` resolves none. `parseAmount` and `formatAmount` throw `InvalidArgumentError` in that case, so check before converting.

`hasTokenMeta` narrows to `AssetInfoWithMeta` — the variant that carries `decimals` — and `requireTokenMeta` asserts it.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import { formatAmount, hasTokenMeta, requireTokenMeta } from "@lelantos-org/sdk";

const asset = await wallet.asset(1n);

// Narrow, and fall back to raw circuit units when metadata is missing.
const label = hasTokenMeta(asset)
    ? formatAmount(wallet.balance(asset.id), asset, { symbol: true })
    : `${wallet.balance(asset.id)} units`;

// Or assert, when a missing adapter capability is a configuration error.
const withMeta = requireTokenMeta(asset);
//    ^?
```

## When the pool pays yield

Where a pool routes an asset's balance to a yield venue, its `index` rises over time. A fixed circuit amount is then worth more underlying than it was — the human value of a note moves while the note itself does not. That is the point of the normalized-unit design, and it is why a withdrawal denomination is a circuit-unit integer rather than a human amount (see [Denominations](/guide/denominations)).

Two consequences for a UI: a formatted balance changes without any transaction, and the conversion is no longer exact in both directions. The rounding is deliberately asymmetric — **down** on the way out of the pool, **up** on the way in — so dust accrues to the remaining holders rather than to whoever is transacting.

```ts twoslash
import { RAY, toCircuitUnits, toTokenUnits } from "@lelantos-org/sdk/core";
import { circuitAmount, tokenAmount } from "@lelantos-org/sdk";
declare const index: bigint;

toTokenUnits(circuitAmount(1000n), 10n ** 12n, { index, round: "down" });
toCircuitUnits(tokenAmount(10n ** 15n), 10n ** 12n, { index, round: "down" });

RAY; // the index at which both reduce to plain `scale` arithmetic
```

`wallet.asset()` resolves `index` and `yieldEnabled` for you, so `parseAmount` and `formatAmount` already account for them.

## Converting without a wallet

The asset-free primitives live in `@lelantos-org/sdk/core`, for code that holds a `scale` and `decimals` but no wallet context.

```ts twoslash
import { formatUnits, parseUnits, toCircuitUnits, toTokenUnits } from "@lelantos-org/sdk/core";
//                                ^?
```

## Branded types

Values the SDK returns are branded — `AssetId`, `CircuitAmount`, `Hex32`, `EvmAddress`, `ShieldedAddress` — so a token amount cannot be passed where a circuit amount belongs. Inputs stay plain (`bigint`, `string`), so `asset: 1n` and `amount: 100n` need no ceremony.

When you implement an SDK interface you are producing branded values, and the constructors validate as they brand:

```ts twoslash
import { assetId, circuitAmount, evmAddress, hex32 } from "@lelantos-org/sdk";

const id = assetId(1n); // throws if negative or beyond uint64
const amount = circuitAmount(500n); // throws if negative
const token = evmAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
const cm = hex32("0x0000000000000000000000000000000000000000000000000000000000000001");
```

## Next

- [Creating a wallet](/guide/wallet)
- [Transfer](/guide/transfer)
