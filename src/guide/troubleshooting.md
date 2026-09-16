# Troubleshooting

Common symptoms, their causes, and fixes. Enable [logging](/guide/logging) for the relevant namespace before investigating, and check the error's `code` — see [Errors](/guide/errors).

## Connecting

### `WALLET_CONFIG` from `connect()`

`err.missing` lists every problem at once. The most common:

| Entry | Fix |
|---|---|
| `` `rpcUrl` `` | public presets ship no RPC endpoint; pass your own. See [Networks](/guide/networks#rpc-endpoint). |
| `a key source` | a `readOnly`, `reader`, or `chain` layer cannot derive `nsk`; add `mnemonic`, `signature`, or `nsk`. |
| `one chain layer` | pass exactly one of `privateKey`, `signer`, `provider` + `address`, `readOnly`, `reader`, `chain`. |

### `USER_REJECTED` with `action: "derive-key"`

The user declined the EIP-712 key-derivation signature at the end of `connect()`. Nothing was built that needs cleaning up; offer to retry.

### `NETWORK_NOT_DEPLOYED`

The preset has no deployed contracts (for example `sepolia`). Use a deployed preset or a custom `NetworkPreset`. See [Networks](/guide/networks).

### TypeScript cannot resolve `@lelantos-org/sdk/...`

Set `"moduleResolution"` to `"nodenext"` or `"bundler"`. If the import is one of the subpaths removed in 0.39 (`/core`, `/wallet`, `/chain`, …), see the [subpath map](/guide/migration-0.38-to-0.39#subpaths).

### `npm install` returns 404

The `@lelantos-org` scope is not configured for GitHub Packages, or `NODE_AUTH_TOKEN` is missing. See [Installation](/guide/installation#_1-configure-the-registry).

## Balance and sync

### A deposit does not appear in the balance

| Cause | Fix |
|---|---|
| The relayer has not flushed the deposit | Wait with `awaitDeposit(result.escrow)`; it syncs until the note appears. See [Deposit lifecycle](/guide/deposit#the-deposit-lifecycle). |
| The deposit went to a different address | Check `recipient` in the deposit call; the default is the wallet's own address. |
| The relayer never flushed it | Once `escrow.cancellableAtBlock` is reached, cancel and reclaim the funds. See [Cancelling a deposit](/guide/deposit#cancelling-a-deposit). |

### Sync returns no notes

| Cause | Fix |
|---|---|
| Different `nsk` than the one that received the notes | Confirm the key source. A mnemonic, a private key, and a signature derive different keys. See [Connecting a wallet](/guide/wallet). |
| Wrong network | Check the preset's `chainId` and service URLs. See [Networks](/guide/networks). |
| Sync did not complete | Check `report.notes.stoppedBy`. `"cursorStalled"` or `"pageCap"` indicates a faulty note source. See [Progress and cancellation](/guide/sync#progress-and-cancellation). |
| `matches` strategy with an unregistered or rotated token | Re-register, or use the stored epoch. See [Registering a subscription](/guide/sync#registering-a-subscription). |

Enable `lelantos:wallet:sync` and `lelantos:sync:scan` logging to see pages fetched and matches found.

### Every sync re-scans from the beginning

A custom `NoteStore` is not persisting `NotesFile.cursor`, or `save()` fails silently. Save the entire object passed to `save()`. See [Custom storage](/guide/storage#implementation-requirements).

### Every startup downloads the tree and nullifier set

`storage.tree` and `storage.nullifiers` are not configured. See [Persisting the tree and spent set](/guide/sync#persisting-the-tree-and-spent-set).

### `balance()` rejects `WALLET_CONFIG` on a watch-only wallet

`balance`, `asset`, and `assets` read asset metadata from the chain. Pass `rpcUrl` or `reader` to `connectWatch`, or use `state().balances`. See [Watch-only wallets](/guide/watch-only#creating-a-watch-only-wallet).

### An incoming-viewing-key wallet shows too high a balance

An incoming viewing key cannot detect spent notes, so balances are the total received. Use a full viewing key. See [Watch-only wallets](/guide/watch-only#key-hierarchy).

## Spending

### `INSUFFICIENT_COVER` with enough balance

The balance is spread across more notes than one spend can use. Check `spendableMax()` and its `withheld.slots`, then consolidate or pass `autoConsolidate: true`. See [What a single spend can reach](/guide/notes#what-a-single-spend-can-reach).

### `NOTES_HELD`

Notes are reserved by another spend, cooling down, or dust. If `err.retryable` is `true`, retry after the other spend settles or a block arrives; `err.held` says which bucket. If it is `false`, only dust would close the gap: lower `selection.dustThreshold` or send less.

### Consolidation runs but the retry fails the same way

The consolidating self-transfer selected different notes. Pin the ids from the error with `selection.only`. See [Consolidating explicitly](/guide/notes#consolidating-explicitly).

### `SPEND_OUTCOME_UNKNOWN`

The submission may have landed. Do not resend blindly; see [Spend outcome unknown](/guide/errors#spend-outcome-unknown).

### The proof is rejected at submission

| Cause | Fix |
|---|---|
| `treeDepth` does not match the deployment | Use the preset's value, or the depth of the deployed contract. See [Networks](/guide/networks#custom-network). |
| The pool's verifier is for a different circuit shape | Use a pool deployed for `TRANSACT_4X6`. See [Circuit shape](/guide/browser#circuit-shape). |
| `relayerAddress` is not the relayer's published submitter | Use the address from the relayer's `/chains` (its `Bundler`). |

### `RELAYER_REJECTED` with a fee reason

`stale-estimate` is retryable as-is. `fee-too-low` and `fee-missing` usually mean a custom `Submitter` without `estimate`. `fee-asset-rejected` means the relayer does not take `feeAsset`. See [Relayer rejections](/guide/errors#relayer-rejections).

### `FEE_ASSET_NOT_QUOTED`

The relayer does not accept the asset named as `feeAsset`. `err.accepted` lists the ones it does; `quoteFee(kind).options` lists them with amounts.

### Cross-asset fee raises `INSUFFICIENT_COVER` with `reason: "fee-slot"`

The spend uses every input slot, leaving none for the fee note. Size it with `spendableMax(asset, { kind, feeAsset })`, consolidate the asset being moved, or pay the fee in it. See [Paying the fee in a different asset](/guide/fees#paying-the-fee-in-a-different-asset).

### `QUOTE_STALE` from `swap`

A yield index or the relayer's flush fee moved since `quoteSwap`. Re-quote and run the new quote. See [Swap](/guide/swap#executing).

## Deposits

### `NO_EVM_ACCOUNT` on deposit

The wallet's chain layer cannot sign (`readOnly`, `reader`, or a passkey-only setup). Connect with `privateKey`, `signer`, or `provider` + `address`. Spends still work without one.

### `UNSUPPORTED_OPERATION` on deposit

The chain adapter lacks the method a deposit path requires (`err.missing` names it): `submitDeposit`, `submitDepositNative` with `nativeAdapterAddress`, or the Permit2 allowance methods. See [Implementing an adapter](/guide/chain-adapter#implementing-an-adapter).

### Yield-bearing asset deposit raises `INVALID_ARGUMENT`

The asset has no `rate`. A custom chain adapter must return `rate` for yield-bearing assets. See [`AssetEntry`](/guide/chain-adapter#assetentry).

### `awaitDeposit` resolves `"timeout"`

The relayer has not flushed the deposit yet, or the indexer is behind. The deposit itself is mined; wait longer, or cancel once cancellable.

## Proving and performance

### `PROVER_ARTIFACTS_MISSING` at the first spend

On Node, install `@lelantos-org/circuits` or set `LELANTOS_PROVER_ARTIFACTS_DIR`. In a browser, pass `prover: { artifacts }` or `prover: { cdn }`. The error's `tried` field lists the locations checked. Call `warmProver()` early to surface this before a user action. See [Node usage](/guide/node#prover-artifacts) and [Browser usage](/guide/browser#prover-artifacts).

### `PROVER_UNAVAILABLE`

The wallet was connected with `prover: "none"`, or the optional peer the backend needs (`snarkjs`, `circom_runtime`) is not installed.

### Proving is much slower than the benchmarks

Check the thread count in the `effective` field of `lelantos:prover:wasm` logs. A value of 1 in a browser means the page is not cross-origin isolated. See [Content Security Policy and isolation](/guide/browser#content-security-policy-and-isolation).

### Sync is much slower in the browser than on Node

The bundler rewrote the SDK's wasm glue and the SDK fell back to JS. Exclude the package from pre-bundling. See [Bundler configuration](/guide/browser#bundler-configuration).

### The UI freezes during a transaction

Proving and trial decryption are running on the main thread. Pass `prover.worker` and `scanner.workers` factories. See [Keeping the main thread free](/guide/browser#keeping-the-main-thread-free).

### The worker fails to load in production builds

The `new Worker(new URL(..., import.meta.url))` expression is not written directly at the call site, so the bundler did not emit a worker chunk. See the warning in [Keeping the main thread free](/guide/browser#keeping-the-main-thread-free).

### Memory grows after switching accounts

Previous wallets were not disposed. Call `dispose()` before replacing a wallet. See [Disposing a wallet](/guide/wallet#disposing-a-wallet).

## Next

- [Errors](/guide/errors)
- [Logging](/guide/logging)
