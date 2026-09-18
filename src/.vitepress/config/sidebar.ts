import type { DefaultTheme } from "vitepress";

/**
 * The hand-written guide navigation.
 *
 * Order is editorial, so this stays an explicit list rather than a directory
 * walk. `scripts/check-nav.mjs` imports it and fails the build when a page in
 * `src/guide/` is missing here, or when an entry points at a page that does not
 * exist — two pages were orphaned that way before the gate existed.
 */
export const guideSidebar: DefaultTheme.SidebarItem[] = [
    {
        text: "Getting started",
        items: [
            { text: "Installation", link: "/guide/installation" },
            { text: "Quickstart", link: "/guide/quickstart" },
        ],
    },
    {
        text: "Concepts",
        items: [
            { text: "Concepts", link: "/guide/concepts" },
            { text: "How it fits together", link: "/guide/system" },
            { text: "Glossary", link: "/guide/glossary" },
        ],
    },
    {
        text: "Wallet",
        items: [
            { text: "Connecting a wallet", link: "/guide/wallet" },
            { text: "Networks", link: "/guide/networks" },
            { text: "Addresses", link: "/guide/addresses" },
            { text: "Amounts and assets", link: "/guide/amounts" },
        ],
    },
    {
        text: "Transactions",
        items: [
            { text: "Deposit", link: "/guide/deposit" },
            { text: "Transfer", link: "/guide/transfer" },
            { text: "Withdraw", link: "/guide/withdraw" },
            { text: "Swap", link: "/guide/swap" },
            { text: "Fees", link: "/guide/fees" },
        ],
    },
    {
        text: "Notes & sync",
        items: [
            { text: "Syncing", link: "/guide/sync" },
            { text: "Balances and state", link: "/guide/state" },
            { text: "Note management", link: "/guide/notes" },
            { text: "Watch-only wallets", link: "/guide/watch-only" },
        ],
    },
    {
        text: "Privacy",
        items: [
            { text: "Denominations", link: "/guide/denominations" },
            { text: "Privacy checklist", link: "/guide/privacy" },
        ],
    },
    {
        text: "Integration",
        items: [
            { text: "Package subpaths", link: "/guide/subpaths" },
            { text: "x402 payments", link: "/guide/x402" },
            { text: "Browser usage", link: "/guide/browser" },
            { text: "Node usage", link: "/guide/node" },
            { text: "Custom storage", link: "/guide/storage" },
            { text: "Pluggable interfaces", link: "/guide/interfaces" },
            { text: "Chain adapters", link: "/guide/chain-adapter" },
        ],
    },
    {
        text: "Operations",
        items: [
            { text: "Errors", link: "/guide/errors" },
            { text: "Logging", link: "/guide/logging" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
            { text: "Benchmarks", link: "/guide/benchmarks" },
        ],
    },
    {
        text: "Internals",
        items: [
            { text: "Architecture", link: "/guide/architecture" },
            { text: "Building transactions manually", link: "/guide/primitives" },
        ],
    },
];
