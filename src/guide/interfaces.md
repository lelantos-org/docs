# Pluggable interfaces

Every external dependency of a wallet is an interface with a working default. `connect()` exposes the ones applications commonly swap; `createWallet(keySource, config)` from `@lelantos-org/sdk/advanced` accepts all of them.

| Interface | Default | `connect` option | `WalletConfig` field | Common replacements |
|---|---|---|---|---|
| `ChainReader` / `ChainAdapter` | `ViemChainReader` / `ViemChainAdapter` | `reader` / `chain` | `chain` (required) | another client library, hardware-wallet signing |
| `Prover` | `WasmProver`, snarkjs fallback, loaded lazily | `prover` | `prover` | a Web Worker prover, a remote prover, a mock |
| `Scanner` | `LocalScanner` | `scanner` | `scanner` | `WorkerPoolScanner` for trial decryption off the main thread |
| `NoteStore` | `InMemoryNoteStore` | `storage.notes` | `noteStore` | file, IndexedDB, encrypted key-value store |
| `TreePersistence`, `NullifierPersistence` | memory | `storage.tree`, `storage.nullifiers` | `treePersistence`, `nullifierPersistence` | IndexedDB, disk |
| `NoteSource` | `FmdNoteSource` over the FMD server | — | `noteSource` | alternative indexer, test fixture |
| `Submitter` | `HttpRelayerSubmitter` | — | `submitter` | several relayers, direct submission, test mock |
| `CoinSelector` | `SfrtCoinSelector` | — | `selector` | `DenominationCoinSelector`, deterministic test stub |
| `TreeStore`, `NullifierStore` | built from the chunk feeds | — | `treeStore`, `nullifierStore` | a pre-seeded or shared cache |

Related guides:

- `ChainReader`, `ChainAdapter` — [Chain adapters](/guide/chain-adapter)
- `NoteStore` — [Custom storage](/guide/storage)
- `TreePersistence`, `NullifierPersistence` — [Syncing](/guide/sync#persisting-the-tree-and-spent-set)
- `Prover`, `Scanner` — [Browser usage](/guide/browser#keeping-the-main-thread-free)
- `DenominationCoinSelector` — [Denominations](/guide/denominations#selecting-for-zero-change)

## Injecting implementations

```ts twoslash
// ---cut-start---
import type { CoinSelector, KeySource, NoteStore, Submitter, WalletConfig } from "@lelantos-org/sdk/advanced";
declare const keySource: KeySource;
declare const config: WalletConfig;
declare const myStore: NoteStore;
declare const mySubmitter: Submitter;
declare const mySelector: CoinSelector;
// ---cut-end---
import { createWallet } from "@lelantos-org/sdk/advanced";

const wallet = await createWallet(keySource, {
    ...config,
    noteStore: myStore,
    submitter: mySubmitter,
    selector: mySelector,
});
```

`createWallet` returns the same `WalletApi` as `connect`, with the same capabilities and errors.

## Custom coin selector

```ts twoslash
import { circuitAmount, type AssetId, type CircuitAmount } from "@lelantos-org/sdk";
import type { CoinSelector, SelectionResult, SelectOpts, StoredNote } from "@lelantos-org/sdk/advanced";

export class LargestFirstSelector implements CoinSelector {
    select(
        all: readonly StoredNote[],
        asset: AssetId,
        target: CircuitAmount,
        opts?: SelectOpts,
    ): SelectionResult {
        const mine = all
            .filter((n) => BigInt(n.asset) === asset && !n.spent)
            .sort((a, b) => (BigInt(b.value) > BigInt(a.value) ? 1 : -1));

        const picked = mine.slice(0, opts?.maxInputs ?? 4);
        const sum = picked.reduce((acc, n) => acc + BigInt(n.value), 0n);
        const needed = target + (opts?.fee ?? 0n);

        if (sum >= needed) {
            return { plan: "direct", notes: picked, sum: circuitAmount(sum) };
        }
        const consolidate = mine.slice(-2);
        return {
            plan: "consolidate-first",
            consolidate,
            consolidateSum: circuitAmount(consolidate.reduce((a, n) => a + BigInt(n.value), 0n)),
            targetWithFee: circuitAmount(needed),
        };
    }
}
```

::: danger Largest-first selection weakens privacy
This example shows the interface only. Largest-first selection creates a balance-ordering pattern that has been used to link spends (Tramèr et al., USENIX '24). The default `SfrtCoinSelector` randomizes selection to prevent it.
:::

The wallet removes notes leased by in-flight spends before calling a selector, and passes the spend's selection rules in `opts` together with the quoted fee and the chain tip. Honouring `dustThreshold`, `cooldownBlocks`, `maxInputs`, and `only` is the selector's job; wrapping `SfrtCoinSelector` keeps them. Return values must use the SDK's branded types; create them with `circuitAmount`, `assetId`, and `hex32`, which validate their input.

## Custom note source

A `NoteSource` returns pages of encrypted notes after a cursor. It does not provide Merkle paths or spent status, because requesting either for a specific note would identify that note to the server.

```ts twoslash
import type { ListNotesOpts, NotePage, NoteSource, ScanInput } from "@lelantos-org/sdk/advanced";

/** Replays a fixed set of notes. Enough to drive a wallet in a unit test. */
export class StaticNoteSource implements NoteSource {
    constructor(private readonly rows: ScanInput[]) {}

    async listNotes(opts?: ListNotesOpts): Promise<NotePage> {
        const after = opts?.after ?? 0;
        const page = this.rows.slice(after, after + (opts?.limit ?? 100));
        const next = after + page.length;
        return { inputs: page, nextAfter: next, resumeAfter: next };
    }
}
```

| Field | Meaning |
|---|---|
| `nextAfter` | cursor for the next page within the current sync; always past every returned row |
| `resumeAfter` | highest cursor that is safe to **persist** |

::: warning Do not persist `nextAfter`
On a feed that is still backfilling history, `resumeAfter` is behind `nextAfter`. Persisting `nextAfter` skips rows inserted later by the backfill, and they are never synced. On an append-only feed the two values are equal.
:::

## Custom submitter

`Submitter` has one required method, `submit`, and five optional ones.

```ts twoslash
import type { ChainToken, EstimateResponse, RelayerSubmitResponse, SubmitTransactPayload } from "@lelantos-org/sdk/protocol";
import { type EstimateKind, HttpRelayerSubmitter, type Submitter } from "@lelantos-org/sdk/advanced";

/** Races two relayers and takes whichever answers first. */
export class RacingSubmitter implements Submitter {
    constructor(
        private readonly primary: HttpRelayerSubmitter,
        private readonly others: HttpRelayerSubmitter[],
    ) {}

    submit(payload: SubmitTransactPayload): Promise<RelayerSubmitResponse> {
        return Promise.any([this.primary, ...this.others].map((p) => p.submit(payload)));
    }

    // Delegate fee quoting and the asset list to one peer. Omitting `estimate`
    // makes the wallet build no fee slot at all — correct only for a relayer
    // that subsidises gas, and a refusal at submit time otherwise.
    estimate(chainId: bigint, kind: EstimateKind): Promise<EstimateResponse> {
        return this.primary.estimate(chainId, kind);
    }

    assets(chainId: bigint): Promise<readonly ChainToken[]> {
        return this.primary.assets(chainId);
    }
}
```

| Method | Required | Without it |
|---|---|---|
| `submit` | yes | — |
| `estimate` | no | the wallet adds no fee output; a relayer that charges fees rejects the submission |
| `assets` | no | the wallet resolves assets by numeric id from the chain registry |
| `submitSwap` | no | `capabilities.swap` is `false` |
| `refundAddress` | no | no relayer-provided refund account for swaps from wallets without an EVM account |
| `swapWrapperAddress` | no | the wrapper must come from the network preset |

A spend's `relayerAddress` is bound into its proof, so every relayer a custom submitter uses must share the address the wallet was configured with.

## Mocking the wallet

Code that uses a wallet, rather than configuring one, can depend on the `WalletApi` or `ReadOnlyWalletApi` interface. Tests can then supply a stub with no chain, relayer, or prover.

```ts twoslash
import type { AssetRef, ReadOnlyWalletApi } from "@lelantos-org/sdk";

export async function totalUnspent(wallet: ReadOnlyWalletApi, assets: AssetRef[]): Promise<bigint> {
    let sum = 0n;
    for (const asset of assets) sum += (await wallet.balance(asset)).total;
    return sum;
}

// In a test, stub only what the code under test calls:
const stub = {
    balance: async () => ({ total: 5n }),
} as unknown as ReadOnlyWalletApi;

await totalUnspent(stub, ["USDC", "WETH"]); // 10n
```

## Next

- [Chain adapters](/guide/chain-adapter)
- [Custom storage](/guide/storage)
