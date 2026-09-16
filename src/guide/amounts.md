# Amounts and assets

A value can be held in three unit spaces. The SDK never guesses which one a number is in: every amount states its space by its shape.

| Space | Example | Used for |
|---|---|---|
| human | `"1.5"` | user input and display |
| base units | `1500000000000000000n` (`TokenAmount`) | ERC-20 balances, allowances, pulls, and what a recipient receives |
| circuit units | `1500n` (`CircuitAmount`) | note values and the pool's `publicIn` / `publicOut` |

Base and circuit units are related per asset:

```
baseUnits = circuitUnits * asset.scale * asset.index / RAY
```

- `scale` is set per asset in the MASP registry. It cannot be derived from `decimals`.
- `index` is the pool's yield index, scaled by `RAY`. For an asset without yield it equals `RAY`, and the formula reduces to `circuitUnits * scale`.

## Resolving an asset

`wallet.asset(ref)` returns the chain-verified registry entry, cached for a few seconds; `{ refresh: true }` re-reads it. `symbol` and `decimals` come from the ERC-20 when the chain adapter can read them.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount, minAmount, parseAmount } from "@lelantos-org/sdk";

const weth = await wallet.asset("WETH");
// → { id: 1n, token: "0xC02a…", scale: 1000000000000000n, symbol: "WETH", decimals: 18,
//     depositBps: 0n, withdrawBps: 25n, index: RAY, yieldEnabled: false, ladder: [...] }

const units = parseAmount("0.25", weth); // 250n — human → circuit
//    ^?

formatAmount(units, weth, { symbol: true }); // "0.25 WETH" — circuit → human
minAmount(weth); // "0.001" — the smallest expressible amount
```

`wallet.assets()` lists every registered asset for display. It is the relayer's list and is not verified against the chain; operations always resolve through the verified path.

### Three ways to name an asset

Every `asset`, `assetIn`, `assetOut`, and `feeAsset` accepts an `AssetRef`. It is required on every operation; there is no default asset.

| Input | Interpreted as | Example |
|---|---|---|
| `bigint` or numeric string | registry id | `1n`, `"1"` |
| 20-byte `0x` string | ERC-20 token address | `"0xC02aaA39…"` |
| any other string | symbol | `"WETH"` |

A `0x` string of the wrong length is rejected as an invalid address. A symbol that matches more than one registered asset raises `INVALID_ARGUMENT`.

## Stating an amount

Every `amount`, `gross`, and `net` accepts an `Amount`:

| Form | Space |
|---|---|
| `"12.5"` | human decimal string of the asset's token |
| `circuitAmount(12_500n)`, or any amount the SDK returned | circuit units |
| `{ baseUnits: 12_500_000n, round? }` | ERC-20 base units |

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
// ---cut-end---
import { circuitAmount } from "@lelantos-org/sdk";

const usdc = await wallet.asset("USDC");
const { max } = await wallet.spendableMax(usdc.id, { kind: "transfer" });

await wallet.transfer({ recipient, asset: usdc.id, amount: "12.50" }); // human
await wallet.transfer({ recipient, asset: usdc.id, amount: { baseUnits: 12_500_000n } }); // base units
await wallet.transfer({ recipient, asset: usdc.id, amount: max }); // an SDK-returned CircuitAmount
await wallet.transfer({ recipient, asset: usdc.id, amount: circuitAmount(1_250n) }); // explicit circuit units
```

A plain `bigint` does not compile: `100n` could be circuit units or base units, which differ by `scale` — up to 10^12. A `number` does not compile either, and is refused at runtime with `INVALID_ARGUMENT` for JavaScript callers.

```ts twoslash
// @errors: 2322
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: string;
// ---cut-end---
await wallet.transfer({ recipient, asset: "USDC", amount: 12_500_000n });
```

A zero or negative amount is refused with `INVALID_ARGUMENT` before any request is made.

## Rounding

An amount finer than one circuit unit has to be rounded or refused. The default depends on the asset:

| Asset | Default | Why |
|---|---|---|
| plain (`index === RAY`) | `"exact"`: refused with `INVALID_ARGUMENT` | a plain unit is a whole number of base units, so an off-unit amount is a typo |
| yield-bearing | `"up"`: the smallest unit count worth at least the amount | a unit is not a whole number of base units, so most human amounts have no exact form |

`"up"` on a yield asset is the inverse of `formatAmount`, which rounds down. A formatted balance therefore parses back to exactly the same units, so a "max" button that formats `spendableMax` and parses the text never over-draws:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount, parseAmount } from "@lelantos-org/sdk";

const usdc = await wallet.asset("USDC");
const { max } = await wallet.spendableMax(usdc.id, { kind: "withdraw" });

const shown = formatAmount(max, usdc); // what the input field displays
parseAmount(shown, usdc) === max; // true, for plain and yield assets alike
```

To choose the rounding yourself, pass `round`:

```ts twoslash
// ---cut-start---
import type { AssetInfo } from "@lelantos-org/sdk";
declare const usdc: AssetInfo;
// ---cut-end---
import { fromBaseUnits, parseAmount, toBaseUnits } from "@lelantos-org/sdk";

parseAmount("0.0000001", usdc, { round: "down" }); // floor: never more than typed
fromBaseUnits(1n, usdc, { round: "up" }); // base units → circuit units, ceil
toBaseUnits(parseAmount("1", usdc), usdc); // circuit → base units; rounds down by default

// As an operation input, round an off-unit base-unit amount explicitly:
const amount = { baseUnits: 1_000_001n, round: "down" } as const;
```

| Function | Direction | Default `round` |
|---|---|---|
| `parseAmount(text, asset)` | human → circuit | `"exact"` plain, `"up"` yield |
| `formatAmount(units, asset, { symbol, maxDecimals })` | circuit → human | `"down"` |
| `toBaseUnits(units, asset)` | circuit → base | `"down"` |
| `fromBaseUnits(base, asset)` | base → circuit | `"exact"` plain, `"up"` yield |
| `minAmount(asset)` | — | the human form of one circuit unit |

All five take any object with `decimals`, `scale`, and an optional `index` (`AssetUnits`), so they also work on an application's own registry rows. `formatAmount` accepts signed amounts, and `parseAmount` a leading `-`, so differences round-trip too.

## Gross and net

A withdrawal and a swap move value out of the pool, and the protocol fee is taken from what leaves. Their amounts state which side of that fee they mean, as exactly one of two fields (`OutAmount`):

| Field | Meaning |
|---|---|
| `gross` | `publicOut`: what leaves the pool, published on chain. The protocol fee comes out of it. |
| `net` | what arrives: at the recipient (withdraw) or at the venue (swap), `gross − protocol fee`. |

With `net`, the SDK computes the smallest `gross` whose net covers the request. That gross is rarely a [denomination](/guide/denominations), so results report `onLadder`. The relayer's fee is never inside either figure; it is always `fees.relayer`.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: `0x${string}`;
// ---cut-end---
// The recipient receives at least 100 USDC; the SDK sizes the gross.
const r = await wallet.withdraw({ asset: "USDC", net: "100", recipient });

r.gross; // what left the pool
r.net; // what arrived: `baseUnits` is exact
r.fees.protocol; // gross − net, or null when the rate is 0
r.onLadder; // false: this gross publishes a distinctive amount
```

Passing both, or neither, does not compile. `outAmount(side, amount)` in `@lelantos-org/sdk/advanced` builds one from a runtime toggle.

## Results carry `Money`

Every value in a result or quote is a `Money`: `{ asset, amount, baseUnits }`, the same figure in both integer spaces. Which field is exact follows where the figure lives:

| Figure | Exact field | The other |
|---|---|---|
| shielded: note values, `gross`, a transfer's `amount`, unit-denominated yield fees | `amount` | `baseUnits`, converted and floored |
| public: pulls, refunds, `net` received, plain-asset protocol fees | `baseUnits` | `amount`, `fromBaseUnits(…, { round: "down" })`, for display |

A fee that was not charged is `null`, never a zero `Money`.

## Yield-bearing assets

When the pool routes an asset to a yield venue, its `index` increases over time. A note's circuit-unit value stays fixed while its token value grows. As a result:

- A formatted balance changes without any transaction.
- Withdrawal denominations are fixed circuit-unit integers, not human amounts. See [Denominations](/guide/denominations).
- `wallet.asset()` resolves `index`, so `parseAmount` and `formatAmount` already account for yield.

### Sizing a payment: use `rate`, not `index`

`index` is for display. The pool floors it on chain, so a charge computed from it can be lower than what the contract pulls, and a Permit2 amount based on it is rejected. Payments are sized from `rate`, the `{ gross, supply }` pair the pool divides by.

`wallet.quoteDeposit()` does this for you and returns the exact pull and the signed ceiling. Without a wallet, `toTokenUnitsAtRate` and `depositTotals` from `@lelantos-org/sdk/protocol` apply the same arithmetic:

```ts twoslash
// ---cut-start---
import type { AssetInfo, CircuitAmount } from "@lelantos-org/sdk";
declare const usdc: AssetInfo;
declare const units: CircuitAmount;
// ---cut-end---
import { toTokenUnitsAtRate } from "@lelantos-org/sdk/protocol";

if (usdc.yieldEnabled && usdc.rate === undefined) {
    // Not a precision problem: this asset cannot be quoted at all.
    throw new Error("pool has not priced this asset yet");
}

toTokenUnitsAtRate(units, usdc.scale, usdc.rate, { round: "up" });
```

| Asset | `rate` | Convert a payment with |
|---|---|---|
| no yield | absent | `scale` |
| yield, priced | present | `rate` |
| yield, not priced | absent | cannot be quoted — do not fall back to `scale` |

## When `decimals` is unknown

`parseAmount` and `formatAmount` throw `INVALID_ARGUMENT` when the asset has no `decimals`, which happens only with a chain adapter that cannot read ERC-20 metadata. `toBaseUnits` and `fromBaseUnits` do not need it. `hasTokenMeta(asset)` and `requireTokenMeta(asset)` from `@lelantos-org/sdk/advanced` narrow or assert:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";
import { hasTokenMeta } from "@lelantos-org/sdk/advanced";

const { asset, total } = await wallet.balance(1n);
const label = hasTokenMeta(asset) ? formatAmount(total, asset, { symbol: true }) : `${total} units`;
```

## Branded types

Values returned by the SDK are branded — `AssetId`, `CircuitAmount`, `TokenAmount`, `Hex32`, `EvmAddress`, `ShieldedAddress` — so the compiler rejects a base-unit amount where a circuit amount is expected. Create branded values with the constructors, which validate their input:

```ts twoslash
import { assetId, circuitAmount, evmAddress, hex32, tokenAmount } from "@lelantos-org/sdk";

const id = assetId(1n); // throws if negative or beyond uint64
const units = circuitAmount(500n); // throws if negative
const base = tokenAmount(500_000_000n);
const token = evmAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
const cm = hex32("0x0000000000000000000000000000000000000000000000000000000000000001");
```

Explicit unit arithmetic without an `AssetInfo` — `toCircuitUnits`, `toTokenUnits`, `parseUnits`, `formatUnits`, `RAY` — is in `@lelantos-org/sdk/protocol`.

## Next

- [Addresses](/guide/addresses)
- [Transfer](/guide/transfer)
- [Denominations](/guide/denominations)
