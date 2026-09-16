# Denominations

A withdrawal publishes its gross amount, `publicOut`. If a user deposits 3,417 units and later withdraws 3,417 units, the two public amounts link the transactions. Withdrawing a value from a fixed **ladder** of denominations publishes an amount that many other withdrawals share.

A ladder is an ascending list of fixed circuit-unit amounts. It does not change with the yield index; only the token value of each denomination does.

## What the ladder prevents

A round trip publishes two amounts: the deposit's `publicIn`, attributed to the payer, and the withdrawal's `publicOut`, attributed to the recipient. Internal transfers publish no amount.

On a yield-bearing asset almost every amount is distinctive. Circuit units are normalized by a moving index, so a round token amount converts to a different unit count every block. A withdrawal of the same integer as a deposit links the two, and reveals the holding period and the yield earned.

A denomination is a fixed integer, so its anonymity set is every withdrawal of that size in the pool's history.

::: danger Do not compute denominations at runtime
A denomination computed from a human amount (`n = human * RAY / (scale * index)`) changes with the index and produces the distinctive amounts the ladder removes. Use the ladder's integers. Their human labels are for display: once yield accrues, `1_000_000_000` may display as ~1050 USDC instead of 1000.
:::

Only `publicOut` needs a denomination. Deposit amounts are public and attributed to the payer regardless, and transfers publish no amount.

## The default ladder

Every asset gets a `{1, 2, 5} × 10^e` series in circuit units, derived from its `scale` and `decimals`. No per-token configuration is needed.

| Property | Behaviour |
|---|---|
| spacing | steps of 2× and 2.5×; any amount is within ~20% of a sum of two or three denominations |
| lower bound | 1e5 circuit units (0.001 WETH, $0.10 USDC at typical scales); bounds leftover dust |
| upper bound | a single cap in circuit units for all assets; the highest denominations are rarely used, so their anonymity sets are small |
| `decimals` | used only to move the range for assets registered at an unusual `scale` |

The ladder is resolved when the `AssetInfo` is built and is available as `asset.ladder`.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
import { circuitAmount, formatAmount } from "@lelantos-org/sdk";

const usdc = await wallet.asset("USDC");

usdc.ladder.length > 0; // does this asset have a ladder at all?
for (const d of usdc.ladder) {
    console.log(formatAmount(circuitAmount(d), usdc, { symbol: true })); // "10 USDC", "20 USDC", …
}
```

## Building a picker

`wallet.withdrawDenominations()` returns each denomination with its current value and the net amount after the protocol fee. Both labels change with the yield index; recompute them instead of caching.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
for (const choice of await wallet.withdrawDenominations("USDC")) {
    console.log(choice.label, "→", choice.netLabel);
    //          ^?
}
```

A `net` withdrawal is sized to its recipient and is almost never a denomination; offer denominations as `gross` amounts. For a typed amount, `previewWithdraw` reports whether it is a denomination and suggests the nearest one. An off-ladder amount is accepted, but it publishes a distinctive value; show this to the user.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const p = await wallet.previewWithdraw({ asset: "USDC", gross: "1234" });

p.hasLadder; // false → the asset has none, and `onLadder` means nothing
p.onLadder; // false → this amount is not one of them
p.suggestion; // the nearest denomination, ties going to the smaller
```

The following example warns on an off-ladder amount and withdraws what the user entered:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
const recipient = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
declare const entered: string;
// ---cut-end---
import { formatAmount } from "@lelantos-org/sdk";

const usdc = await wallet.asset("USDC");
const p = await wallet.previewWithdraw({ asset: usdc.id, gross: entered });

if (p.hasLadder && !p.onLadder && p.suggestion !== undefined) {
    // Offer the nearest denomination. It can be above or below what was typed;
    // ties go to the smaller.
    console.warn(`off-ladder; nearest denomination is ${formatAmount(p.suggestion, usdc)}`);
}

await wallet.withdraw({ recipient, asset: usdc.id, gross: p.publicOut });
```

Offer the suggestion; do not substitute it automatically. Only the user knows whether a smaller amount is acceptable.

## Change lands on the ladder too

Change is split into ladder denominations, largest first, with any remainder in one final note:

```
decompose(4900n, ladder, 4) → pieces [2000, 2000, 500], dust 400
```

The remainder can be re-split later by a self-transfer, which publishes no amount. `redenominate` runs those self-transfers in a loop:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
// ---cut-end---
const rounds = await wallet.redenominate("USDC", { maxRounds: 4 });
```

- Each round creates `nOut - 1` denomination notes and one remainder note, until the remainder is below the smallest denomination.
- It is idempotent and safe to run on a schedule.
- A round that cannot find cover ends the loop without throwing.
- The return value is the number of rounds run. `0` means the asset has no ladder or no notes needed splitting.

## Selecting for zero change

`DenominationCoinSelector` wraps the default SFRT selector and prefers note sets that pay the target exactly. An exact cover produces no change note. The selector is a `createWallet` option in `@lelantos-org/sdk/advanced`:

```ts twoslash
// ---cut-start---
import type { KeySource, WalletConfig } from "@lelantos-org/sdk/advanced";
declare const keySource: KeySource;
declare const config: WalletConfig;
// ---cut-end---
import { createWallet, DenominationCoinSelector } from "@lelantos-org/sdk/advanced";

const wallet = await createWallet(keySource, { ...config, selector: new DenominationCoinSelector() });
```

All other SFRT behaviour — dust thresholds, spend cooldown, reservations, consolidation — is unchanged. The default selector is plain SFRT.

## What the ladder does not hide

The ladder removes the amount as a link. Other withdrawal data remains public:

| Still public | Implication |
|---|---|
| recipient address | withdrawals to one address are linked to each other and to that address's identity |
| number and timing of withdrawals | a large balance leaves as several withdrawals; spread them across blocks and recipients |
| deposit amounts | a rare deposit amount still narrows the candidate set |
| network metadata | the relayer sees timing and IP address unless requests are routed elsewhere via `http.fetch` |

- **Net amount.** The recipient receives the denomination minus `withdrawBps`, computed on chain, so all withdrawals of one denomination at one time receive the same net. Choosing `publicOut` to produce a round net amount — which is what `withdraw({ net })` does — makes `publicOut` distinctive again.
- **Off-ladder amounts.** An amount no one else withdraws links to its funding deposit and marks the wallet as not using the ladder.
- **Actual anonymity set.** The set is the number of users who withdrew that denomination, not the number who could have. The smallest and largest denominations, and low-traffic pools, provide less cover.

Note selection and FMD delegation are separate privacy considerations; see [Note management](/guide/notes) and [Syncing](/guide/sync#sync-strategies).

## Disabling ladders

`denominations` on `connect()`, `connectWatch()`, and `WalletConfig` enables or disables ladders:

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

await connect({ network: "base", rpcUrl, privateKey, denominations: false });
```

| Value | Effect |
|---|---|
| `true` (default) | every asset has a derived ladder |
| `false` | change is split evenly, `previewWithdraw` reports no ladder, `redenominate` does nothing |

::: warning The ladder is shared across SDK versions
Every wallet on the same SDK version derives the same denominations for an asset, which is what forms a shared anonymity set. Versions with different ladders split that set, so the ladder changes only through a coordinated migration.
:::

## Next

- [Privacy checklist](/guide/privacy)
- [Withdraw](/guide/withdraw)
- [Note management](/guide/notes)
