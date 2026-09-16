# Fees

An operation can incur three separate costs, each charged by a different party.

| Fee | Charged by | Paid in | Public |
|---|---|---|---|
| **Gas** | the network | native ETH | yes |
| **Protocol fee** | the MASP contract | the moved asset: added to a deposit, deducted from a withdrawal | yes |
| **Relayer fee** | the relayer | any asset the relayer accepts, as a shielded note (for a deposit, a second leaf) | no |

You pay gas only for transactions your own account broadcasts: deposits, cancellations, and allowance setup. For relayed transactions the relayer pays gas and recovers it through the relayer fee.

Every result and quote reports the last two as `fees: { protocol, relayer }`, each a `Money` or `null` when not charged.

## Protocol fee

Rates are set **per asset and per direction** and are returned on `AssetInfo`. There is no pool-wide rate.

| Rate | Applies to | Calculation |
|---|---|---|
| `depositBps` | `deposit`, and the re-shield leg of a swap | **added to** the principal |
| `withdrawBps` | `withdraw`, and the unshield leg of a swap | **deducted from** the gross amount |

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { parseAmount } from "@lelantos-org/sdk";
import { withdrawNetFor } from "@lelantos-org/sdk/protocol";

const usdc = await wallet.asset("USDC");
usdc.depositBps; // shield rate, in basis points
usdc.withdrawBps; // unshield rate

// What a 1000 USDC gross withdrawal delivers, in ERC-20 base units.
const { net, fee } = withdrawNetFor(parseAmount("1000", usdc), usdc);
//      ^?
```

`withdrawNetFor` takes the whole asset because it needs `withdrawBps`, `scale`, `index`, and `yieldEnabled`. A withdrawal names either side of this fee with `gross` or `net`; see [Gross or net](/guide/withdraw#gross-or-net).

### Deposits of yield-bearing assets

For a yield-bearing asset, the deposit total is converted to token units once using the pool's `rate`, not `index`.

- **An asset without `rate` cannot be deposited.** The SDK raises `INVALID_ARGUMENT`. `scale` is not used as a fallback because it underestimates what the pool pulls.
- **The signed amount is a ceiling, not the quote.** The pool's rate increases every block, so the SDK signs the exact pull plus a small headroom: `quoteDeposit().pulls[].ceiling`. Permit2 transfers only what the pool requests (`pulls[].amount`), and `NativeAdapter` refunds unused ETH. Plain assets sign the exact pull.

Re-quote before submitting if the user takes time to confirm.

### Overriding rates

`feeBps` on `createWallet`'s `WalletConfig` replaces the rates the pool reports for every asset. It is not a `connect()` option: against a live pool it produces wrong quotes as soon as the owner changes a rate. Use it only when the real rates are unavailable, such as on a fork, in tests, or before the registry is deployed.

## Relayer fee

A relayer can charge for relaying. The fee is a shielded output note addressed to the relayer, created inside the transaction it pays for, so no public transfer links the payer to the transaction.

`quoteFee(kind)` returns the fee before the transaction is built, and which assets the wallet can pay it in:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

const quote = await wallet.quoteFee("transfer");

if (!quote.charged) {
    console.log("this relayer relays transfers for free");
} else {
    for (const option of quote.options) {
        console.log(
            option.asset.symbol ?? option.asset.id,
            formatAmount(option.amount, option.asset),
            option.affordable ? "affordable" : "insufficient balance",
        );
    }
}
```

| `kind` | Estimate |
|---|---|
| `"transfer"` | spend estimate |
| `"withdraw"` | spend estimate; `{ native: true }` prices the unwrap path |
| `"swap"` | swap estimate; gas covers both legs and the trade |
| `"deposit"` | the relayer's later `flushBatch`; `balance` and `affordable` are `undefined`, because a deposit's fee is funded from the public wallet |

| `FeeOption` field | Meaning |
|---|---|
| `asset` | an accepted asset, resolved in the registry |
| `amount`, `baseUnits` | the fee note's value in circuit units (exact) and base units |
| `balance` | this wallet's unspent shielded balance of the asset |
| `affordable` | `balance >= amount` |

::: warning `affordable` does not guarantee the spend succeeds
`affordable` compares the fee with the unspent balance of that asset. The notes must also fit the circuit's input slots, alongside the notes being spent. Use `spendableMax(asset, { kind, feeAsset })` for a figure that accounts for both.
:::

## Paying the fee in a different asset

By default the relayer fee is paid in the moved asset. Set `feeAsset` to pay in another:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const recipient: `0x${string}`;
// ---cut-end---
const { max } = await wallet.spendableMax("WETH", { kind: "withdraw", feeAsset: "USDC" });

await wallet.withdraw({ asset: "WETH", gross: max, recipient, feeAsset: "USDC" });
```

For spends:

- The fee asset needs its own input note and change slot. The published 4×6 circuit has room for both.
- The relayer must accept the asset. An asset it does not quote is rejected with `FEE_ASSET_NOT_QUOTED` before proving; `err.accepted` lists the ones it takes.
- `spendableMax` with the same `feeAsset` reserves the fee note's input slot, so the maximum and the spend agree. A spend that uses every slot for the moved asset fails with `INSUFFICIENT_COVER` and `reason: "fee-slot"`.

### A deposit's relayer fee

A deposit also pays the relayer with a note, funded from the payer's **public** balance. `feeAsset` selects the asset and defaults to `asset`. The protocol fee is always charged in the deposited asset.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
// Shield USDC, pay the relayer in WETH.
const quote = await wallet.quoteDeposit({ asset: "USDC", amount: "100", feeAsset: "WETH" });

quote.separateFee; // true: two token pulls
quote.pulls; // [{ token: USDC, amount: principal + protocol fee }, { token: WETH, amount: relayer fee }]

const result = await wallet.deposit({ asset: "USDC", amount: "100", feeAsset: "WETH" });
result.pulled; // what was actually pulled, per asset
```

When `feeAsset` differs from `asset`, the deposit makes **two token transfers**: the principal and protocol fee in the deposited token, and the relayer fee in the fee token.

- The signature strategy signs both amounts in one Permit2 batch permit.
- The allowance strategy is used only when an active Permit2 allowance covers both tokens.
- If the relayer charges nothing, the fee note has zero value in the deposited asset, and the deposit makes one transfer regardless of `feeAsset`.

Cancelling such a deposit refunds each token separately: `refunded` in the deposited asset and `feeRefunded` in the fee asset. See [Cancelling a deposit](/guide/deposit#cancelling-a-deposit).

#### Unsupported fee assets

The SDK rejects these combinations with `INVALID_ARGUMENT` on `feeAsset` before signing:

| Combination | Reason |
|---|---|
| `native: true` with a different fee asset | `NativeAdapter` transfers only the wrapped native token |
| a yield-bearing fee asset different from the deposited asset | the pool rejects it with `FeeAssetUnsupported` |

A fee asset the relayer does not accept is refused with `FEE_ASSET_NOT_QUOTED`, because the relayer would not flush the deposit and it would stay in escrow until cancelled.

To filter a fee-asset picker without a quote per option, `depositFeeAssetRefusal` from `@lelantos-org/sdk/protocol` returns the reason without throwing:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { depositFeeAssetRefusal } from "@lelantos-org/sdk/protocol";

const usdc = await wallet.asset("USDC");
const { options } = await wallet.quoteFee("deposit");

const payable = options.filter((o) => depositFeeAssetRefusal(usdc, o.asset, false) === undefined);
//    ^?
```

#### Computing pulls without a wallet

`depositTotals` and `depositPulls` from `@lelantos-org/sdk/protocol` are the arithmetic `quoteDeposit` runs:

```ts twoslash
import { depositPulls, depositTotals } from "@lelantos-org/sdk/protocol";

// 100 USDC principal (scale 1e4), relayer quoted 42 WETH circuit units (scale 1e10).
const { principal, relayer } = depositTotals({
    publicIn: 10_000n,
    feeIn: 42n,
    depositBps: 20n,
    scale: 10_000n,
    publicAssetId: 1n, // USDC
    feeAssetId: 2n, // WETH; pass 1n when the fee is in the deposited asset
    feeScale: 10_000_000_000n, // read only when the note is pulled separately
});

const usdc = { id: 1n, token: "0x…a1", yieldEnabled: false };
const weth = { id: 2n, token: "0x…e7", yieldEnabled: false };

const { separateFee, byToken } = depositPulls({ deposited: usdc, feeAsset: weth, principal, relayer });
// byToken: [{ asset: usdc, amount: principal }, { asset: weth, amount: relayer }]
```

| `depositPulls` field | Contents |
|---|---|
| `byAsset` | one entry per transfer the pool requests (the batch permit entries) |
| `byToken` | amounts summed per ERC-20 token; a plain asset and a yield asset can share one token, balance, and Permit2 allowance |
| `separateFee` | the fee asset when its note is pulled separately, else `undefined` |

Pass `publicAssetId` and `feeAssetId` to `depositTotals`. Without them, the presence of `feeScale` alone means a separate fee transfer, and passing it for a fee in the deposited asset produces an incorrect split.

## Stale fee quotes

A spend is priced against the relayer's estimate at submission time. A relayer that refuses the fee answers with `RELAYER_REJECTED` and a `reason`:

| `reason` | Retryable | Meaning |
|---|---|---|
| `stale-estimate` | yes | the estimate moved; retrying re-quotes |
| `fee-too-low`, `fee-missing` | no | the fee note does not satisfy this relayer |
| `fee-asset-rejected` | no | the relayer does not take this fee asset |

See [Errors](/guide/errors#relayer-rejections).

## Next

- [Errors](/guide/errors)
- [Building transactions manually](/guide/primitives)
