# Networks

A network preset contains the deployment details `connect()` needs: chain id, pool and relayer addresses, service URLs, and the circuit's tree depth. Pass a preset name or a `NetworkPreset` object as `network`.

| Preset | Chain id | Status |
|---|---|---|
| `mainnet` | 1 | deployed |
| `base` | 8453 | deployed |
| `arbitrum` | 42161 | deployed |
| `sepolia` | 11155111 | placeholder; not accepted by `connect()` |
| `anvil` | 31337 | the SDK's own test preset; its addresses are deploy-dependent |

The deployed networks share one relayer and one FMD server. `NETWORKS` exports the table.

## RPC endpoint

The public presets ship no RPC endpoint: a shared default would rate-limit and observe every user. Pass your own as `rpcUrl`, which overrides `preset.rpcUrl`:

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

const wallet = await connect({ network: "arbitrum", rpcUrl: "https://arb-rpc.example.com", privateKey });
```

Without an endpoint, `connect()` throws `WALLET_CONFIG` before any signing prompt. `rpcUrl` is not needed when the chain layer is pre-built (`chain` or `reader`).

## Placeholder presets

A placeholder preset has `maspAddress: null` and `relayerAddress: null`. Its name does not compile as `network`, because `DeployedNetworkName` excludes it:

```ts twoslash
// @errors: 2322
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect } from "@lelantos-org/sdk";

await connect({ network: "sepolia", rpcUrl, privateKey });
```

Called from JavaScript, the same call throws `NETWORK_NOT_DEPLOYED`. An unknown name throws `WALLET_CONFIG`.

## Custom network

```ts twoslash
// ---cut-start---
declare const privateKey: `0x${string}`;
declare const rpcUrl: string;
// ---cut-end---
import { connect, type NetworkPreset } from "@lelantos-org/sdk";

const myChain: NetworkPreset = {
    chainId: 8453n,
    maspAddress: "0x0000000000000000000000000000000000000001",
    relayerAddress: "0x0000000000000000000000000000000000000002",
    relayerUrl: "https://relayer.my-deployment.example",
    fmdUrl: "https://fmd.my-deployment.example",
    treeDepth: 10,
    // Optional:
    quoterUrl: "https://quote.my-deployment.example", // enables swaps
    nativeAdapterAddress: "0x0000000000000000000000000000000000000003", // native deposits and withdrawals
    permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", // defaults to the canonical deployment
    submitTimeoutMs: 30_000,
};

const wallet = await connect({ network: myChain, rpcUrl, privateKey });
```

| Field | Effect when absent |
|---|---|
| `quoterUrl` | `capabilities.swap` is `false` |
| `rpcUrl` | `rpcUrl` must be passed to `connect()` |
| `nativeAdapterAddress` | `capabilities.nativeDeposit` and `nativeWithdraw` are `false` |
| `swapWrapperAddress` | read from the relayer's `/chains` |
| `permit2Address` | the canonical `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| `submitTimeoutMs` | 30,000 ms per submit attempt; `http.submitTimeoutMs` overrides it |

`relayerAddress` is bound into every proof. It must be the submitter address the relayer publishes on `/chains` — its `Bundler` contract where it bundles, not its signing account.

::: warning `treeDepth` must match the deployment
The value must equal the depth used by the deployed contract and circuit. A mismatch produces no local error; proofs fail verification on chain.
:::

## Next

- [Chain adapters](/guide/chain-adapter)
- [Browser usage](/guide/browser)
