# Pluggable interfaces

Nine injection points on `WalletConfig`. Only `chain` is required; every other has a working default, so replace one when you need behaviour the default cannot give you — a different indexer, a test double, an off-main-thread scanner.

| Interface | Default | Replace it for |
|---|---|---|
| `ChainAdapter` | — (**required**) | ethers / web3.js / hardware-wallet signing |
| `NoteSource` | `FmdNoteSource` (over `FmdClient`) | alt indexer, P2P feed, unit-test mock |
| `NoteStore` | `InMemoryNoteStore` | file, IndexedDB, encrypted KV |
| `TreeStore` | built from the commitment chunk feed | pre-seeded tree, shared cache |
| `NullifierStore` | built from the nullifier chunk feed | pre-seeded spent set, shared cache |
| `Submitter` | `HttpRelayerSubmitter` | multi-relayer race, direct on-chain submit, test mock |
| `Prover` | `WasmProver` (snarkjs fallback; `useWasmProver: false` opts out) | Web Worker prover, mock |
| `CoinSelector` | `SfrtCoinSelector` | largest-first, Penumbra planner, deterministic test stub |
| `Scanner` | `LocalScanner` | `WorkerPoolScanner` for off-main-thread trial decryption |

`TreeStore` and `NullifierStore` are usually configured through `treePersistence` / `nullifierPersistence` rather than replaced outright — see [Syncing](/guide/sync).

`WalletApi` is itself an interface, so upstream tests can mock the whole wallet rather than its parts.

## Where to inject

`connect()` accepts every pluggable directly, alongside the network preset and key source. Reach for `Wallet.create()` only when you want no defaults resolved at all.

```ts twoslash
// ---cut-start---
import type { CoinSelector, NoteStore, Submitter } from "@lelantos-org/sdk";
declare const myStore: NoteStore;
declare const mySubmitter: Submitter;
declare const mySelector: CoinSelector;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
    noteStore: myStore,
    submitter: mySubmitter,
    selector: mySelector,
});
```

## Custom coin selector

```ts twoslash
import { circuitAmount } from "@lelantos-org/sdk";
import type { AssetId, CircuitAmount, StoredNote } from "@lelantos-org/sdk";
import type { CoinSelector, SelectionResult, SelectOpts } from "@lelantos-org/sdk/wallet";

class LargestFirstSelector implements CoinSelector {
    select(
        all: readonly StoredNote[],
        asset: AssetId,
        target: CircuitAmount,
        _opts?: SelectOpts,
    ): SelectionResult {
        const mine = all
            .filter((n) => BigInt(n.asset) === asset && !n.spent)
            .sort((a, b) => (BigInt(b.value) > BigInt(a.value) ? 1 : -1));

        const picked = mine.slice(0, 2);
        const sum = picked.reduce((acc, n) => acc + BigInt(n.value), 0n);

        if (sum >= target) {
            return { plan: "direct", notes: picked, sum: circuitAmount(sum) };
        }
        const consolidate = mine.slice(-2);
        return {
            plan: "consolidate-first",
            consolidate,
            consolidateSum: circuitAmount(consolidate.reduce((a, n) => a + BigInt(n.value), 0n)),
            targetWithFee: target,
        };
    }
}
```

::: danger Largest-first is shown as an example, not a recommendation
Selecting by descending value leaves a balance-ordering fingerprint that has been used to link spends (Tramèr et al., USENIX '24). The default `SfrtCoinSelector` randomizes the tiebreak specifically to remove it. Replace the selector for testing or for a different privacy analysis — not for convenience.
:::

::: tip Branded values
Implementing an SDK interface means producing its branded types. The constructors — `circuitAmount`, `assetId`, `hex32` — validate as they brand, so an invalid value fails at the boundary rather than deep inside the circuit.
:::

## Custom note source

A `NoteSource` answers one question: give me a page of encrypted notes after this cursor. Merkle paths and the spent set are deliberately *not* part of it — both would name a specific note to the server.

```ts twoslash
import type { ListNotesOpts, NotePage, NoteSource } from "@lelantos-org/sdk";
import type { ScanInput } from "@lelantos-org/sdk/sync";

/** Replays a fixed set of notes. Enough to drive a wallet in a unit test. */
class StaticNoteSource implements NoteSource {
    constructor(private readonly rows: ScanInput[]) {}

    async listNotes(opts?: ListNotesOpts): Promise<NotePage> {
        const after = opts?.after ?? 0;
        const page = this.rows.slice(after, after + (opts?.limit ?? 100));
        const next = after + page.length;
        return { inputs: page, nextAfter: next, resumeAfter: next };
    }
}
```

::: warning `nextAfter` and `resumeAfter` are not always the same
`nextAfter` drives the loop within one sync and always advances past everything just returned. `resumeAfter` is the highest cursor safe to **persist**, and on a feed still backfilling history it lags behind. Persisting `nextAfter` there steps over rows the backfill has not inserted yet, losing them permanently. On a strictly append-only feed the two are equal.
:::

## Custom submitter

`Submitter` has one required method and three optional ones. The optional three are optional so that a submitter written before a feature existed keeps working.

```ts twoslash
import type { Submitter } from "@lelantos-org/sdk";
import { HttpRelayerSubmitter } from "@lelantos-org/sdk";
import type { RelayerSubmitResponse, SubmitTransactPayload } from "@lelantos-org/sdk/protocol";

// `EstimateKind` is not exported on its own; derive it from the interface.
type EstimateKind = Parameters<NonNullable<Submitter["estimate"]>>[1];

/** Races two relayers and takes whichever answers first. */
class RacingSubmitter implements Submitter {
    constructor(private readonly peers: HttpRelayerSubmitter[]) {}

    submit(payload: SubmitTransactPayload): Promise<RelayerSubmitResponse> {
        return Promise.any(this.peers.map((p) => p.submit(payload)));
    }

    // Delegate fee quoting and the asset registry to the first peer. Omitting
    // `estimate` would make the wallet build no fee slot at all — correct only
    // for a relayer that subsidises gas, and a 402 at submit time otherwise.
    estimate(chainId: bigint, kind: EstimateKind) {
        return this.peers[0]!.estimate(chainId, kind);
    }

    assets(chainId: bigint) {
        return this.peers[0]!.assets(chainId);
    }
}
```

## Mocking the whole wallet

For code that consumes a wallet rather than configures one, `WalletApi` is the seam. Depend on the interface and a test needs no chain, relayer, or prover at all.

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
// ---cut-end---
declare function makeStubWallet(): WalletApi;

async function totalBalance(wallet: WalletApi, assets: bigint[]): Promise<bigint> {
    return assets.reduce((sum, id) => sum + wallet.balance(id), 0n);
}

await totalBalance(makeStubWallet(), [1n, 2n]);
```

## Next

- [Chain adapters](/guide/chain-adapter)
- [Custom storage](/guide/storage)
