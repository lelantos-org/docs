# Chain adapters

The chain port is the SDK's only interface to the chain. `connect()` builds the viem implementation from `rpcUrl` and the chain-layer option; implement the port yourself to use another client library, a custom signer, or a transport `connect` does not cover. Everything on this page is in `@lelantos-org/sdk/advanced`.

## Two halves

| Interface | Holds | Used by |
|---|---|---|
| `ChainReader` | everything a chain can answer without a key: registry, tree roots, token state, receipts | every wallet: sync, spends, quotes, `asset()` |
| `ChainAdapter` | `ChainReader` plus signing as the user's EOA and the deposit, cancel, and Permit2 writes | deposits, `cancelDeposit`, `setupDepositAllowance` |

A spend is authorized by its proof and broadcast by the relayer, so the spend path only ever reads. A wallet built on a `ChainReader` (`reader`, or `readOnly: true`) transfers, withdraws, and swaps normally; only its deposit methods reject `NO_EVM_ACCOUNT`.

An adapter's behaviour must depend only on its constructor arguments, not on global state.

## Implementing a reader

`chainId`, `maspAddress`, and `fetchAsset` are the required members; every other read is optional.

```ts twoslash
// ---cut-start---
declare function readRegistry(id: bigint): Promise<{ token: `0x${string}`; scale: bigint; disabled: boolean; depositBps: bigint; withdrawBps: bigint; index: bigint; yieldEnabled: boolean }>;
// ---cut-end---
import { evmAddress, type AssetId, type EvmAddress } from "@lelantos-org/sdk";
import type { AssetEntry, ChainReader } from "@lelantos-org/sdk/advanced";

export class MyChainReader implements ChainReader {
    constructor(
        private readonly id: bigint,
        private readonly pool: EvmAddress,
    ) {}

    async chainId(): Promise<bigint> {
        return this.id;
    }

    async maspAddress(): Promise<EvmAddress> {
        return this.pool;
    }

    async fetchAsset(id: AssetId): Promise<AssetEntry> {
        const entry = await readRegistry(id);
        return { ...entry, token: evmAddress(entry.token) };
    }
}
```

Addresses are branded `EvmAddress` values: build them with `evmAddress()`, which validates and checksums.

### `AssetEntry`

| Field | Notes |
|---|---|
| `token`, `scale`, `disabled` | the registry entry |
| `depositBps`, `withdrawBps` | per-asset fee rates, read with the entry; there is no separate fee method |
| `index`, `yieldEnabled` | the pool's yield index (RAY-scaled; `RAY` for a plain asset) and whether the asset yields; both required |
| `rate` | `{ gross, supply }`; **required** for yield-bearing assets |

::: warning Provide `rate` for yield-bearing assets
`index` is floored on chain, so a deposit sized from it can be lower than the amount the contract pulls, and the Permit2 transfer fails. Without `rate`, deposits of a yield-bearing asset fail. `scale` is not a substitute.
:::

### Optional reads

When an optional member is missing, the dependent feature is unavailable; nothing else fails.

| Member | Without it |
|---|---|
| `tokenMeta` | no `symbol` / `decimals`; human-unit conversion throws |
| `blockNumber` | the spend cooldown is inactive, and `cancellableAtBlock` cannot be compared with the tip |
| `isKnownRoot` | root validity is determined from the commitment feed only |
| `nativeAdapterAddress` | no native deposits or withdrawals |
| `tokenBalanceOf`, `nativeBalance`, `tokenAllowance`, `permit2Allowance` | `quoteDeposit` reports `balance` / `allowance` as `undefined` |
| `getEscrowed`, `fetchDepositEscrowed`, `cancelDelay` | no cancel by `depositId`; `cancellableAtBlock` uses a conservative bound |
| `waitTxReceipt`, `txReceiptLogs` | no confirmation wait after broadcast; results carry no `operation` |

## Implementing an adapter

A `ChainAdapter` adds `payerAddress` and `signPermit2`, both required, plus the writes for the deposit paths your chain supports.

| Member | Enables |
|---|---|
| `submitDeposit` | the `witness` strategy (a Permit2 signature per deposit) |
| `submitDepositAuthorized`, `permit2Allowance`, `permit2PermitAllowance`, `signPermit2Allowance` | the `allowance` strategy |
| `signPermit2AllowanceBatch`, `permit2PermitAllowanceBatch`, `tokenApprove`, `tokenAllowance` | `setupDepositAllowance` |
| `submitDepositNative` + `nativeAdapterAddress` | native deposits |
| `cancelDeposit`, `cancelDepositNative` | reclaiming escrows |

Each deposit write resolves once mined with `{ txHash, depositId, blockNumber, escrowed }`, where `escrowed` is the pool's decoded `DepositEscrowed` log. A signing failure from the user should reject with `UserRejectedError`; the viem adapter maps EIP-1193 code `4001` for you.

Type guards narrow a reader to a capability:

```ts twoslash
// ---cut-start---
import type { ChainReader } from "@lelantos-org/sdk/advanced";
declare const chain: ChainReader;
// ---cut-end---
import {
    supportsAllowanceBatch,
    supportsAllowanceTransfer,
    supportsNativeEth,
    supportsSigning,
} from "@lelantos-org/sdk/advanced";

if (supportsSigning(chain)) {
    // `chain` is a ChainAdapter here.
    await chain.payerAddress();
}
if (supportsNativeEth(chain)) {
    chain.nativeAdapterAddress(); // non-optional here
}

const canSetUpAllowance = supportsAllowanceTransfer(chain);
const canBatchAllowances = supportsAllowanceBatch(chain); // strictly narrower
```

Code holding a wallet can read `wallet.capabilities` instead, which answers the same questions from the same checks.

## Adapter-specific reads

`wallet.chain` is typed as `ChainReader`. Narrow it with a guard, or check a member, to call an optional read:

```ts twoslash
// ---cut-start---
import type { WalletApi } from "@lelantos-org/sdk";
declare const wallet: WalletApi;
declare const depositId: bigint;
// ---cut-end---
const record = await wallet.chain.fetchDepositEscrowed?.(depositId);
//    ^?
```

## Constructing the viem adapter

`ViemChainAdapter` takes an `EthSigner`: `PrivateKeySigner` for a raw key, or `Eip1193Signer` for a browser provider. `ViemChainReader` is the read-only half. Build one directly to set options `connect` does not expose, such as `cacheTimeMs`, then pass it as `chain` (or `reader`) with an explicit key source.

```ts twoslash
// ---cut-start---
declare const rpcUrl: string;
declare const nsk: bigint;
declare const privateKey: `0x${string}`;
// ---cut-end---
import { connect, NETWORKS } from "@lelantos-org/sdk";
import { PrivateKeySigner, ViemChainAdapter } from "@lelantos-org/sdk/advanced";

const base = NETWORKS.base;

const chain = new ViemChainAdapter({
    rpcUrl,
    signer: new PrivateKeySigner(privateKey, rpcUrl, base.chainId), // the signer pins its chain id
    maspAddress: base.maspAddress,
    chainId: base.chainId,
    cacheTimeMs: 0, // default: every blockNumber() reads the chain
});

// A pre-built adapter exposes no key to derive from, so the shielded key source is explicit.
const wallet = await connect({ network: "base", chain, nsk });
```

## Next

- [Pluggable interfaces](/guide/interfaces)
- [Networks](/guide/networks)
