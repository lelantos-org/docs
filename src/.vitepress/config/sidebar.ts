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
            { text: "Concepts", link: "/guide/concepts" },
            { text: "How it fits together", link: "/guide/system" },
        ],
    },
    {
        text: "Core usage",
        items: [
            { text: "Creating a wallet", link: "/guide/wallet" },
            { text: "Amounts", link: "/guide/amounts" },
            { text: "Addresses", link: "/guide/addresses" },
        ],
    },
    {
        text: "Transactions",
        items: [
            { text: "Deposit", link: "/guide/deposit" },
            { text: "Transfer", link: "/guide/transfer" },
            { text: "Withdraw", link: "/guide/withdraw" },
            { text: "Swap", link: "/guide/swap" },
        ],
    },
    {
        text: "Notes & sync",
        items: [
            { text: "Syncing", link: "/guide/sync" },
            { text: "Note management", link: "/guide/notes" },
        ],
    },
    {
        text: "Extending",
        items: [
            { text: "Custom storage", link: "/guide/storage" },
            { text: "Chain adapters", link: "/guide/chain-adapter" },
            { text: "Pluggable interfaces", link: "/guide/interfaces" },
            { text: "Networks", link: "/guide/networks" },
        ],
    },
    {
        text: "Browser",
        items: [{ text: "Browser usage", link: "/guide/browser" }],
    },
    {
        text: "Advanced",
        items: [
            { text: "Fees", link: "/guide/fees" },
            { text: "Low-level primitives", link: "/guide/primitives" },
            { text: "Logging", link: "/guide/logging" },
            { text: "Errors", link: "/guide/errors" },
            { text: "Architecture", link: "/guide/architecture" },
        ],
    },
];
