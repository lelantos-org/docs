# Networks

A network preset carries everything `connect()` needs to reach one deployment: the chain id, the pool and relayer contract addresses, the service URLs, and the tree depth the circuit was built for. Pass a built-in name or your own preset object; an unknown name throws at `connect()` time.

| Preset | chainId | Status |
|---|---|---|
| `anvil` | 31337 | local |
| `localnet` | 31337 | local (anvil alias) |
| `mainnet` | 1 | deployed |
| `base` | 8453 | deployed |
| `arbitrum` | 42161 | deployed |
| `sepolia` | 11155111 | placeholder → `NetworkNotDeployedError` |

The three deployed chains share one relayer and one FMD server; only the chainId differs.

A preset is a **placeholder** when its `maspAddress` or `relayerAddress` is `null`, and that is what `connect()` refuses on. `sepolia` carries service URLs and a `deploymentStatusUrl` but no contracts yet.

## Custom network

Pass a `NetworkPreset` object in place of the name.

```ts twoslash
// ---cut-start---
declare const pk: `0x${string}`;
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
    permit2Address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", // optional
};

const wallet = await connect({ privateKey: pk, network: myChain, rpcUrl });
```

Set `maspAddress` or `relayerAddress` to `null` to mark a preset as a placeholder; `connect()` then throws `NetworkNotDeployedError`.

`treeDepth` must match the deployed contract and the circuit build. A mismatch is not caught locally — the proof simply fails to verify on chain.

## Next

- [Chain adapters](/guide/chain-adapter) — building the adapter yourself
- [Errors](/guide/errors)
- [Browser usage](/guide/browser)
