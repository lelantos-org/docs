# Migrating from 0.38 to 0.39

0.39 is a breaking redesign of the public API. The relayer wire format, the Permit2 typed data, and the circuit are unchanged. Key derivation is not: every versioned derivation tag restarts at 1, so the same MetaMask account, mnemonic, or private key derives a **different** `nsk` and shielded address than in 0.38. Withdraw funds from a 0.38 wallet before upgrading; a note sent to a 0.38 address is not visible to the 0.39 wallet.

The changes, in the order most applications meet them:

| Area | 0.38 | 0.39 |
|---|---|---|
| Constructor | `connect()` returning the `Wallet` class; `fastWallet`, `nodeWallet`, `Wallet.create` | `connect()` returning the frozen `WalletApi` object; [`createWallet`](#explicit-configuration) in `./advanced` |
| RPC endpoint | `rpcUrl` inside each chain-layer option | top-level `rpcUrl`, [required for public presets](#connect) |
| Read-only chain layer | `noSigner: true` | `readOnly: true` |
| Prover options | `prover`, `proverArtifacts`, `proverArtifactsCdn`, `useWasmProver`, `proverWarmup` (default eager) | one [`prover`](#prover) option; default lazy |
| Storage options | `noteStore`, `treePersistence`, `nullifierPersistence` | [`storage: { notes, tree, nullifiers }`](#storage-and-pluggables) |
| Transport | `fetchImpl`; custom clients for timeouts | [`http: { fetch, timeoutMs, retries, headers, … }`](#storage-and-pluggables) |
| Default asset | `asset` optional, defaulting to id 1 | `asset` required on every operation |
| Amounts | `bigint` = circuit units, `string` = token units | [`Amount`](#amounts): string, branded `CircuitAmount`, or `{ baseUnits }`; plain `bigint` does not compile |
| Recipients | `to`, `bRecipient` | `recipient` everywhere |
| Withdraw amount | `amount` (gross) | [`gross` or `net`](#withdraw) |
| Native ETH | `withdrawEth()`, `deposit({ asEth })` | `withdraw({ native: true })`, `deposit({ native: true })` |
| Swap | `fetchSwapQuote` + `swap({ assetIn, assetOut, amount, quote, wrapperAddress })` | [`quoteSwap()` then `swap({ quote })`](#swap) |
| Reads | `notes()`, `balance()` synchronous; `balances()` | [`await notes()`, `await balance()`](#sync-and-state) → `{ total, spendable, withheld }`; `state().balances` |
| Sync | `sync`, `syncNotes`, `syncTree`, `syncNullifiers`, `refresh` | [`sync({ scope, reload })`](#sync-and-state) → `SyncReport` |
| Results | `sent`, `received`, `feePaid`, `inputSum`, `depositId` | [`Money` figures and `fees: { protocol, relayer }`](#results-and-fees) |
| Fee quotes | `quoteFee({ kind })`, `kind: "withdrawNative"` | `quoteFee(kind, { native })` |
| Errors | `SELECTION`, `PERMIT_REJECTED`, `DEPOSIT_ADAPTER`, `NO_DEPOSIT_ACCOUNT`, message matching | [renamed and split codes, `retryable` on every error](#errors) |
| Imports | 27 typed subpaths, many names in several | [11 typed subpaths, one home per name](#subpaths) |
| Watch-only | `WatchWallet.create`, `connectWatch({ chain })` | `createWatchWallet` in `./advanced`; `connectWatch({ rpcUrl \| reader })` |
| Dependencies | `viem` optional peer | `viem` **required** peer |

## Connect

`rpcUrl` moved to the top level, and public presets ship none: pass your own endpoint. It is validated with every other option before any signing prompt, and the key is derived last, so a user no longer signs and then sees `connect` fail.

```diff
 import { connect } from "@lelantos-org/sdk";

 const wallet = await connect({
-    network: "base",
-    provider: window.ethereum,
-    address,
-    rpcUrl,
-    proverArtifacts: { circuit, zkey },
-    noteStore,
-    fetchImpl,
+    network: "base",
+    rpcUrl,
+    provider: window.ethereum,
+    address,
+    prover: { artifacts: { circuit, zkey } },
+    storage: { notes: noteStore },
+    http: { fetch: fetchImpl },
 });
```

- `noSigner: true` is now `readOnly: true`.
- The `localnet` preset is gone, and a placeholder preset name such as `"sepolia"` no longer compiles as `network`.
- `DeployedNetworkPreset` is gone; `NetworkPreset` has non-null addresses and gains `rpcUrl`, `quoterUrl`, and `swapWrapperAddress`.
- `connect` returns `WalletApi`, an interface over a frozen object of bound methods. Destructuring (`const { sync } = wallet`) works. The class members that leaked plumbing — `P`, `J`, `cfg`, `noteStore`, `submitter`, `prover`, `selector`, `markSpent`, `selectNotes` — are on `walletInternals(wallet)` in `./internal`.
- `wallet.keys` holds bech32m strings (`viewingKey`, `fullViewingKey`, `tier`); the raw spending key is only on `walletInternals(wallet).keys`.
- New: `wallet.capabilities` says which operations this configuration supports. See [Capabilities](/guide/wallet#capabilities).

### Presets `fastWallet` and `nodeWallet`

```diff
-import { fastWallet } from "@lelantos-org/sdk";
-const wallet = await fastWallet({ network, privateKey, rpcUrl, pool: { worker, size: 4 } });
+import { connect } from "@lelantos-org/sdk";
+const wallet = await connect({ network, rpcUrl, privateKey, scanner: { workers: worker, size: 4 } });
```

`nodeWallet({ keys, config })` becomes `createWallet(keys, config)`; see [Explicit configuration](#explicit-configuration).

### Prover

The prover is lazy by default: `connect` fetches nothing, and a read-only application never downloads the ~50 MB artifacts. Artifact problems surface at the first proof or at `warmProver()`.

| 0.38 | 0.39 |
|---|---|
| `prover: myProver` | `prover: myProver` |
| `proverArtifacts: { circuit, zkey }` | `prover: { artifacts: { circuit, zkey } }` |
| `proverArtifactsCdn: url` | `prover: { cdn: url }` |
| `useWasmProver: false` | `prover: { backend: "snarkjs" }` |
| `proverWarmup: "eager"` (default) | `prover: { warmup: "eager" }`, or call `wallet.warmProver()` |
| — | `prover: "none"`: spends reject `PROVER_UNAVAILABLE` |
| `browserWorkerProver({ worker, paths })` | `prover: { artifacts, worker }`, or pass `browserWorkerProver({ worker, artifacts })` |
| `{ wasmPath, zkeyPath }` artifact paths | `{ circuit, zkey }` everywhere (`ProverPaths` is no longer public) |

### Storage and pluggables

| 0.38 `connect` option | 0.39 |
|---|---|
| `noteStore`, `treePersistence`, `nullifierPersistence` | `storage: { notes, tree, nullifiers }` |
| `scanner: browserWorkerScanner({ worker, size })` | `scanner: { workers: worker, size }`, or a `Scanner` instance |
| `fetchImpl` | `http: { fetch }` |
| `submitter`, `selector`, `noteSource`, `treeStore`, `nullifierStore`, `feeBps` | `createWallet` config only |
| custom `FmdClient` / `HttpRelayerSubmitter` for timeouts | `http: { timeoutMs, submitTimeoutMs, retries, onRetry, headers }` |

Submissions now retry only when no response arrived, or on 429 and 503; a 500 or 502 on a submission is never resent. `retryOnSubmit` is removed.

A `Prover` or `Scanner` instance passed to `connect` is no longer disposed by `wallet.dispose()` or by a failed `connect`: the SDK disposes only what it built. If you relied on the wallet to terminate a `browserWorkerProver(…)` or `browserWorkerScanner(…)` you passed, dispose it yourself, or pass `prover: { artifacts, worker }` / `scanner: { workers }` and let the wallet own the workers.

`x402(wallet, { fetchImpl })` from `@lelantos-org/sdk/x402` follows the same naming: pass `http: { fetch }`. The service clients (`HttpClientOptions`, `fetchSwapQuote`) and `ViemChainReader` take `fetch` rather than `fetchImpl` too. `x402` reads the offer only from the v2 `PAYMENT-REQUIRED` header; a 402 that carries it only in the body is `unsupported-requirements`.

### Explicit configuration

```diff
-import { Wallet } from "@lelantos-org/sdk";
-const wallet = await Wallet.create(keySource, { ...config, proverPaths });
+import { createWallet } from "@lelantos-org/sdk/advanced";
+const wallet = await createWallet(keySource, {
+    ...config,
+    prover: { artifacts: { circuit: proverPaths.wasmPath, zkey: proverPaths.zkeyPath } },
+});
```

`WalletConfig` loses `fetchImpl` (use `http`) and `proverPaths` (use `prover.artifacts`), and gains `http`, `quoterUrl`, `swapWrapperAddress`, and a `prover` that accepts a `ProverConfig` or `"none"`.

## Amounts

A plain `bigint` amount no longer compiles, because it was ambiguous between circuit units and base units. State the space by the value's shape:

```diff
-await wallet.transfer({ to, amount: 12_500_000n });
+await wallet.transfer({ recipient, asset: "USDC", amount: circuitAmount(12_500_000n) }); // circuit units
+await wallet.transfer({ recipient, asset: "USDC", amount: { baseUnits: 12_500_000n } }); // base units
+await wallet.transfer({ recipient, asset: "USDC", amount: "12.5" }); // token units, as before
```

Amounts the SDK returns (`spendableMax().max`, `balance().total`, `err.consolidateSum`) are already branded and pass straight back in.

| 0.38 | 0.39 |
|---|---|
| `parseAmount` rounds **down** on a yield asset | rounds **up** on a yield asset (`"exact"` on a plain one), the inverse of `formatAmount`; `{ round }` overrides |
| round-up workarounds for "max" inputs | not needed: `parseAmount(formatAmount(x, a), a) === x` |
| `AmountLike` | `Amount` |
| `parseUnits`, `formatUnits`, `toCircuitUnits`, `toTokenUnits` at the root | `./protocol`; prefer `parseAmount`, `formatAmount`, `toBaseUnits`, `fromBaseUnits` at the root |
| `denominations(asset)`, `isDenominated(asset)` | `asset.ladder`, `asset.ladder.length > 0` |
| `DEFAULT_ASSET` | removed; name the asset |
| an operation with `amount <= 0` failing after network calls | `INVALID_ARGUMENT` before any request |

See [Amounts and assets](/guide/amounts).

## Withdraw

`amount` was the gross. It is now named, and you can name the other side instead:

```diff
-await wallet.withdraw({ to, amount: 200n, asset: 1n });
-await wallet.withdrawEth({ to, amount: 200n, asset: 1n });
+await wallet.withdraw({ recipient, asset: 1n, gross: circuitAmount(200n) });
+await wallet.withdraw({ recipient, asset: 1n, gross: circuitAmount(200n), native: true });
+await wallet.withdraw({ recipient, asset: "USDC", net: "100" }); // new: what the recipient receives
```

`native: true` now also accepts `feeAsset`. A `net` withdrawal is sized with `grossForNet` and is rarely a denomination; `result.onLadder` reports it. `previewWithdraw` takes `{ asset, gross }` or `{ asset, net }`.

`spendableMax(asset, selectOpts)` became `spendableMax(asset, { kind, feeAsset, native, selection })`: with `kind`, it reserves the relayer fee itself, so the manual `fee` subtraction is gone.

```diff
-const quote = await wallet.quoteFee({ kind: "withdraw" });
-const fee = quote.options.find((o) => o.asset.id === 1n)?.amount ?? 0n;
-const { max } = await wallet.spendableMax(assetId(1n), { fee });
+const { max } = await wallet.spendableMax(1n, { kind: "withdraw" });
```

## Swap

The wallet quotes swaps itself, resolves the wrapper address from the preset or the relayer, and computes the credited amount.

```diff
-import { fetchSwapQuote } from "@lelantos-org/sdk/quoter";
-import { sizeBNote } from "@lelantos-org/sdk/wallet";
-const quote = await fetchSwapQuote(quoterUrl, { chainId, tokenIn, tokenOut, amountIn, slippageBps: 50 });
-const credited = sizeBNote(quote.minOut, scaleOut, depositBpsOut);
-await wallet.swap({ assetIn: 1n, assetOut: 2n, amount: 100n, quote, wrapperAddress, bRecipient });
+const quote = await wallet.quoteSwap({ assetIn: 1n, assetOut: 2n, net: circuitAmount(100n), slippageBps: 50 });
+quote.credit; // what the output note will hold
+await wallet.swap({ quote, recipient });
```

0.38's swap `amount` reached the venue and the protocol fee was added on top, so it corresponds to `net` in 0.39. `swap` re-derives the quote's figures and rejects `QUOTE_STALE` (retryable: re-quote) when a yield index or the relayer's flush fee moved. `SwapResult` replaces `depositId` with `creditCommitment` and `refundCommitment`. See [Swap](/guide/swap).

## Deposits

| 0.38 | 0.39 |
|---|---|
| `deposit({ amount, asset?, to, asEth })` | `deposit({ asset, amount, recipient, native })` |
| phases `signing`, `submitting`, `broadcast`, `mined` | `preparing`, `signing`, `submitting`, `broadcast`, `confirmed` |
| `result.depositId` + `DepositStream.awaitFlush` | `result.escrow` + `wallet.awaitDeposit(result.escrow)` |
| `cancelDeposit(id, inputs)` from a manually fetched log; `cancelDepositNative` on the adapter | `cancelDeposit(result.escrow)` or `cancelDeposit({ depositId })`; native escrows routed automatically |
| hand-built Permit2 approve → batch sign → permit | `setupDepositAllowance({ assets, onProgress })` |
| `depositTotals` + `depositPulls` for a deposit form | `quoteDeposit(args)` → pulls, fees, strategy, balances, allowances |
| `depositTotals({ feeScale })` to mark a note in another asset | `depositTotals({ publicAssetId, feeAssetId, feeScale })`: both ids are required |

`NoDepositAccountError` is now `NO_EVM_ACCOUNT`, with a neutral message. See [Deposit](/guide/deposit).

## Sync and state

```diff
-await wallet.syncNotes();
-await wallet.syncTree();
-await wallet.refresh();
-const units = wallet.balance(1n);
-const all = wallet.balances();
-const mine = wallet.notes({ spent: false });
+await wallet.sync({ scope: "notes" });
+await wallet.sync(); // scope "full" on a spending wallet
+await wallet.sync({ reload: true });
+const { total, spendable, withheld } = await wallet.balance(1n);
+const all = wallet.state().balances;
+const mine = await wallet.notes({ spent: false });
```

- `sync()` returns a `SyncReport`: `{ notes, tree?, nullifiers?, syncedAt }`. `stoppedBy` moved to `report.notes.stoppedBy`. The page-size option `limit` is now `pageSize`.
- `onProgress` events are tagged by `stream` (`"notes"`, `"tree"`, `"nullifiers"`).
- `awaitCommitments(cms, { maxAttempts })` takes `{ timeoutMs, pollMs, pageSize }` instead, defaulting to 120 s.
- `balance()` is async and split: `total = spendable + withheld.*`. `spendable` matches what one spend can reach.
- New: `state()` and `subscribe()` for rendering without polling; `useSyncExternalStore(wallet.subscribe, wallet.state)` works as is. See [Balances and state](/guide/state).
- Concurrent spends lease disjoint notes instead of racing for the same ones.
- A persisted notes store must hold schema version 1. A file written by 0.38 is not upgraded: opening it rejects `WALLET_CONFIG`, so clear the store and sync again.

## Results and fees

Every value in a result is a `Money` (`{ asset, amount, baseUnits }`), every result names its `asset` and `opId`, and fees are reported as `fees: { protocol, relayer }` with `null` for "not charged".

| 0.38 | 0.39 |
|---|---|
| `DepositResult.sent`, `depositId` | `amount`, `escrow.depositId`; also `pulled`, `fees`, `recipient` |
| `TransferResult.sent`, `inputSum` | `amount`; `inputSum` removed |
| `WithdrawResult.sent`, `received`, `feePaid` | `gross`, `net`, `fees.protocol` |
| `SwapResult.sent`, `depositId` | `gross`, `net`, `expectedCredit`, `refundCredit`, `creditCommitment`, `refundCommitment` |
| `ownInflow` | removed; sum `ownCommitments` notes after sync if needed |
| no relayer fee on any result | `fees.relayer` |
| `quoteFee({ kind: "withdrawNative" })` | `quoteFee("withdraw", { native: true })` |
| `FeeQuoteResult` | `FeeQuote`: `{ kind, charged, payTo, options }`; `FeeOption.baseUnits` added |

Every operation also accepts `signal`, `opId`, and `deadline` (transfer and withdraw check it before submitting).

## Errors

Every method rejects with a `WalletError` (or your own abort reason), and every error has `retryable` and a typed `context`. Match codes with `isWalletError(err, code)`; message text is not part of the API.

| 0.38 code | 0.39 |
|---|---|
| `SELECTION` | split: `INSUFFICIENT_BALANCE` (not enough value), `NOTES_HELD` (`NotesHeldError`: reserved, cooling down, or dust; often retryable), `INSUFFICIENT_COVER` with `reason: "fee-slot"`, or `INVALID_ARGUMENT` |
| `PERMIT_REJECTED` (`PermitRejectedError`) | `USER_REJECTED` (`UserRejectedError`), with `action`: `"derive-key"`, `"sign-permit"`, or `"send-tx"` |
| `DEPOSIT_ADAPTER` (`DepositAdapterError`) | `UNSUPPORTED_OPERATION` (`UnsupportedOperationError`), with `operation` and `missing` |
| `NO_DEPOSIT_ACCOUNT` (`NoDepositAccountError`) | `NO_EVM_ACCOUNT` (`NoEvmAccountError`) |
| `TX_MINING` on a revert | `TX_REVERTED`; `TX_MINING` now means only "receipt did not arrive in time" (retryable) |
| `WIRE_FORMAT` at `$.root` | `TREE_OUT_OF_SYNC` (retryable) |
| `NetworkError` 402 from a spend | `RELAYER_REJECTED` with `reason` `fee-missing`, `fee-too-low`, or `fee-asset-rejected` |
| `NetworkError` after a submit timed out | `SPEND_OUTCOME_UNKNOWN`: the spend may have landed; its notes are reserved — see [Spend outcome unknown](/guide/errors#spend-outcome-unknown) |
| a bare `Error` or `RangeError` from inside the SDK | a typed code, or `INTERNAL` with the original as `cause` |

New codes: `FEE_ASSET_NOT_QUOTED`, `DEADLINE_PASSED`, `QUOTE_STALE`, `RELAYER_REJECTED`, `SPEND_OUTCOME_UNKNOWN`, `RPC_FAILED`, `TX_REVERTED`, `TREE_OUT_OF_SYNC`, `PROVER_UNAVAILABLE`, `INSUFFICIENT_BALANCE`, `NOTES_HELD`.

```diff
-if (e instanceof SelectionError && /awaiting an earlier spend/.test(e.message)) retry();
-if (e instanceof NetworkError && e.status === 409 && e.body?.includes("in flight")) retry();
+if (isWalletError(e, "NOTES_HELD") && e.retryable) retry();
+if (isWalletError(e, "RELAYER_REJECTED") && e.reason === "nullifier-in-flight") retry();
```

`InsufficientCoverError` gains `reason` and branded `asset`, `target`, and `consolidateSum`, and `NetworkError.status` / `body` describe only the final attempt (`attempts` has the history). See [Errors](/guide/errors) for the full table.

## Subpaths

Twenty-one subpaths were removed. Every name now has exactly one home; the root holds the application surface. The table maps each removed subpath to where its names went; a few names moved individually, listed below.

| 0.38 import | 0.39 import |
|---|---|
| `@lelantos-org/sdk/errors`, `/networks`, `/wallet` (app types) | `@lelantos-org/sdk` |
| `@lelantos-org/sdk/wallet` (plumbing: `SelectOpts`, `CoinSelector`, `EstimateKind`, `supportsDeposit`, …), `/chain`, `/sync`, `/log` (`loggingFromEnv`) | `@lelantos-org/sdk/advanced` |
| `@lelantos-org/sdk/core` (fees, units, denominations, pulls), `/bundle`, `/permit2`, `/circuit` (shapes) | `@lelantos-org/sdk/protocol` |
| `@lelantos-org/sdk/core` (hex, field, random), `/crypto`, `/keys`, `/notes`, `/fmd` | `@lelantos-org/sdk/primitives` |
| `@lelantos-org/sdk/relayer`, `/fmd-server`, `/quoter` | `@lelantos-org/sdk/services` |
| `@lelantos-org/sdk/wasm-prover` | `@lelantos-org/sdk/prover` |
| `@lelantos-org/sdk/prover-worker`, `/scanner-worker` | `@lelantos-org/sdk/workers/prover`, `/workers/scanner` |
| `@lelantos-org/sdk/presets` | `connect` options — see [above](#presets-fastwallet-and-nodewallet) |
| circuit internals, `decodeStoredNote`, test hooks | `@lelantos-org/sdk/internal` (unstable) |

Names that moved individually:

| Name | 0.38 | 0.39 |
|---|---|---|
| `ViemChainAdapter`, `PrivateKeySigner`, `Eip1193Signer`, `HttpRelayerSubmitter`, `InMemoryNoteStore`, `FmdNoteSource`, `NoteStore`, `NotesFile`, `KeySource`, `WalletConfig`, `supportsNativeEth`, `hasTokenMeta` | root | `./advanced` |
| `RAY`, `TRANSACT_4X6`, `depositTotals`, `withdrawNetFor`, `DenominationPolicy`, `YieldRate` | root | `./protocol` |
| `ADDRESS_HRP`, `detectionKey`, `deriveKeysFromNsk`, `viewingKeyFromSpending` | root | `./primitives` |
| `Prover` | root | `./prover` |
| `WalletApi`, `CircuitAmount`, `TokenAmount`, `EvmAddress`, `DepositResult`, `SpendableMax`, error classes | various | root |
| `Wallet` | root | removed: `WalletApi` |
| `WatchWallet` | `./watch` | removed: `ReadOnlyWalletApi` (root), `createWatchWallet` (`./advanced`) |
| `SwapQuote` (quoter response) | `./quoter` | `SwapRouteQuote` in `./services`; the root `SwapQuote` is `quoteSwap`'s result |
| `DepositPull` (per-entry) | `./core` | `DepositPullEntry` in `./protocol`; the root `DepositPull` is a `DepositQuote` entry |
| `FeeQuote` (relayer wire) | `./protocol` | `RelayerFeeQuote` |
| `CancelDepositResult` (adapter receipt) | `./chain` | `CancelDepositReceipt` in `./advanced`; the root `CancelDepositResult` is `cancelDeposit`'s result |
| `FMD_SENDER_GAMMA` | `./fmd` | `FMD_DEFAULT_GAMMA` in `./primitives` |
| `parseUnits`, `formatUnits`, `toCircuitUnits`, `toTokenUnits` | root and `./core` | `./protocol` |
| `denominations`, `isDenominated`, `DEFAULT_ASSET`, `safePhase`, `canDeposit` | root / `./wallet` | removed |
| `WasmJubjub` | `./crypto` | `Jubjub` in `./primitives` |
| `TransactAux` | `./protocol` | `OutputAux` in `./primitives` |

In the browser, update worker URLs:

```diff
-new Worker(new URL("@lelantos-org/sdk/prover-worker", import.meta.url), { type: "module" })
+new Worker(new URL("@lelantos-org/sdk/workers/prover", import.meta.url), { type: "module" })
```

A DOM `Worker` now satisfies `WorkerLike` directly; drop any `as unknown as WorkerLike` adapter.

## A complete 0.39 example

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
declare const peer: string;
declare const exchange: `0x${string}`;
// ---cut-end---
import { connect, formatAmount, isWalletError } from "@lelantos-org/sdk";

const wallet = await connect({ network: "base", rpcUrl, privateKey });

const deposit = await wallet.deposit({ asset: "USDC", amount: "100" });
await wallet.awaitDeposit(deposit.escrow);

const { spendable, asset } = await wallet.balance("USDC");
console.log(formatAmount(spendable, asset, { symbol: true }));

try {
    await wallet.transfer({ asset: "USDC", amount: "25", recipient: peer, autoConsolidate: true });
    await wallet.withdraw({ asset: "USDC", net: "50", recipient: exchange });
} catch (err) {
    if (isWalletError(err, "NOTES_HELD") && err.retryable) {
        // another spend holds the notes; retry shortly
    } else {
        throw err;
    }
}

await wallet.dispose();
```

## Next

- [Connecting a wallet](/guide/wallet)
- [Package subpaths](/guide/subpaths)
- [Errors](/guide/errors)
