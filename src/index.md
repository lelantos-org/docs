---
layout: home
hero:
  name: Lelantos SDK
  text: Shielded transfers on EVM
  tagline: Deposit, transfer, swap and withdraw in a Multi-Asset Shielded Pool. Client-side proving, no trusted intermediary.
  image:
    src: /icon.svg
    alt: Lelantos
  actions:
    - theme: brand
      text: Quickstart
      link: /guide/quickstart
    - theme: alt
      text: Concepts
      link: /guide/concepts
features:
  - title: One call per operation
    details: deposit, transfer, withdraw, quoteSwap and swap, sync, balance. Note selection, nullifiers, witnesses and proofs stay behind the wallet, and every failure is a typed error with a stable code.
  - title: Pluggable all the way down
    details: Replace the chain adapter, indexer, submitter, prover, coin selector, scanner or store — each independently, each with a working default.
  - title: Primitives when you need them
    details: Fee arithmetic, keys, FMD, note encryption, bundle builders and the prover, each with one home on a subpath, so a bundler drops what you do not import.
  - title: Runs where your users are
    details: Node 24+, browsers, Deno. Web Crypto and fetch only — no node builtins, enforced in CI.
---

::: tip If you are an agent
You can find these docs as plain markdown: [llms.txt](https://docs.lelantos.xyz/llms.txt) indexes every page, [llms-full.txt](https://docs.lelantos.xyz/llms-full.txt) is the whole guide in one file, and any page is available by appending `.md` to its URL — for example [/guide/quickstart.md](https://docs.lelantos.xyz/guide/quickstart.md).
:::
