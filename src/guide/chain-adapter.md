# Chain adapters

The `ChainAdapter` is the only part of the SDK that talks to a chain. `ViemChainAdapter` ships with the SDK and is what `connect()` builds; implement the interface yourself to drive ethers, web3.js, or a hardware wallet.

## What the adapter is responsible for

- **Signing the Permit2 witness** that binds a deposit and its ERC-20 pull into one atomic transaction, so there is no separate `approve`.
- **Resolving asset metadata** — `scale` from the MASP registry, and `symbol`/`decimals` when it implements `tokenMeta`.
- **Broadcasting deposits**, and reading back the escrow state that `cancelDeposit` needs.
- **Reporting the chain tip**, which is what makes the selector's spend cooldown work at all.

Adapters must be deterministic with respect to their constructor inputs — no hidden global state.

## The required surface

Six methods are mandatory. Everything else is optional and feature-probed.

<!-- typecheck: skip -->
```ts
import type { AssetEntry, ChainAdapter, Permit2SignArgs } from "@lelantos-org/sdk";

class EthersChainAdapter implements ChainAdapter {
    async chainId(): Promise<bigint> { ... }
    async payerAddress(): Promise<string> { ... }
    async maspAddress(): Promise<string> { ... }
    async fetchAsset(id: bigint): Promise<AssetEntry> { ... }
    async fetchFeeBps(): Promise<bigint> { ... }

    async signPermit2(args: Permit2SignArgs) {
        // Drive your signer to produce the Permit2 witness signature bound
        // to `args.piHash`.
    }
}
```

::: tip Why this block is not typechecked
The `...` bodies are illustrative rather than real implementations. The interface is fully documented in the [reference](/reference/chain/).
:::

## Optional methods change what the wallet can do

An adapter that omits an optional method does not fail — the wallet simply loses the path that needed it. That is deliberate, and it means a UI should probe rather than assume.

| Method | Omitting it means |
|---|---|
| `tokenMeta` | no `symbol`/`decimals`; human-unit conversion throws |
| `blockNumber` | the selector's spend cooldown is inert |
| `submitDepositNative` + `nativeAdapterAddress` | no native-ETH deposit or unshield |
| `submitDepositAuthorized` + the Permit2 allowance methods | no allowance-mode deposits |
| `cancelDeposit` | escrowed deposits cannot be reclaimed |
| `waitTxReceipt` | no confirmation wait after broadcast |

Three named guards narrow an adapter to the capability set a path needs:

```ts twoslash
// ---cut-start---
import type { ChainAdapter } from "@lelantos-org/sdk";
declare const chain: ChainAdapter;
// ---cut-end---
import {
    supportsAllowanceBatch,
    supportsAllowanceTransfer,
    supportsNativeEth,
} from "@lelantos-org/sdk";

if (supportsNativeEth(chain)) {
    // `submitDepositNative` and `nativeAdapterAddress` are both non-optional here.
    chain.nativeAdapterAddress();
}

const canSetUpAllowance = supportsAllowanceTransfer(chain);
const canBatchAllowances = supportsAllowanceBatch(chain); // strictly narrower
```

Deposit strategies (`native`, `allowance`, `witness`) are chosen per-asset from these probes; a mismatch raises `DepositAdapterError`.

## Reaching adapter-specific methods

`WalletApi.chain` is typed as the interface, so anything beyond it needs a cast to the concrete adapter — which is exactly what `ViemChainAdapter`'s escrow readers require.

```ts twoslash
// ---cut-start---
import { connect } from "@lelantos-org/sdk";
const wallet = await connect({
    privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    network: "anvil",
    rpcUrl: "http://localhost:8545",
});
// ---cut-end---
import type { ViemChainAdapter } from "@lelantos-org/sdk/chain";

const chain = wallet.chain as ViemChainAdapter;
const record = await chain.fetchDepositEscrowed(1n);
//    ^?
```

## Building one directly

`ViemChainAdapter` takes an `EthSigner`, which is the SDK's own signing abstraction — `PrivateKeySigner` for a raw key, `Eip1193Signer` for a browser provider. Build the adapter yourself when you want a `NativeAdapter` address, a pinned `chainId`, or a signer the `connect()` options do not cover.

```ts twoslash
// ---cut-start---
declare const maspAddress: string;
declare const rpcUrl: string;
// ---cut-end---
import { connect, PrivateKeySigner, ViemChainAdapter } from "@lelantos-org/sdk";

const chain = new ViemChainAdapter({
    rpcUrl,
    signer: new PrivateKeySigner(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
        rpcUrl,
        31337n, // the signer pins its own chainId
    ),
    maspAddress,
    nativeAdapterAddress: "0x0000000000000000000000000000000000000001",
});

// A pre-built adapter exposes no signing key, so the shielded key source
// must be supplied explicitly.
const wallet = await connect({ chain, network: "anvil", nsk: 1n });
```

## Next

- [Pluggable interfaces](/guide/interfaces)
- [Networks](/guide/networks)
