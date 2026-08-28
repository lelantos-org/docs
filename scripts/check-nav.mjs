// Every guide page is reachable, and every sidebar entry exists.
//
// Two pages shipped orphaned before this gate: `fees.md` was written, built,
// and linked from nowhere, and `logging.md` was reachable only through a single
// inline link, with the sidebar never highlighting it. Neither failed the build
// — VitePress only checks links that exist, not pages that are missing from the
// navigation — so both were found by eye, which does not scale.
//
// The sidebar is imported from the config rather than re-parsed, so there is one
// source of truth. Node strips the TypeScript types on import.
//
// Run: npm run check:nav

import { existsSync } from "node:fs";
import { join } from "node:path";
import { guideSidebar } from "../src/.vitepress/config/sidebar.ts";
import { fail, guidePages, ROOT } from "./lib/docs.mjs";

/** Every `link` in the sidebar tree, however deeply nested. */
function links(items) {
    return items.flatMap((item) => [
        ...(item.link ? [item.link] : []),
        ...(item.items ? links(item.items) : []),
    ]);
}

const navLinks = links(guideSidebar);
const navSet = new Set(navLinks);

// `src/guide/foo.md` -> `/guide/foo`, matching how the sidebar addresses it.
const pages = (await guidePages())
    .filter((f) => f.startsWith("src/guide/"))
    .map((f) => `/${f.slice("src/".length).replace(/\.md$/, "")}`);

const orphaned = pages.filter((p) => !navSet.has(p));
if (orphaned.length) {
    fail(
        `${orphaned.length} guide page(s) are not in the sidebar:`,
        orphaned,
        "Add each to src/.vitepress/config/sidebar.ts, or delete the page.\n" +
            "A page missing from the sidebar still builds — readers just cannot find it.",
    );
}

const dangling = navLinks.filter((l) => !existsSync(join(ROOT, "src", `${l.slice(1)}.md`)));
if (dangling.length) {
    fail(
        `${dangling.length} sidebar entr(ies) point at a page that does not exist:`,
        dangling,
        "Create the page, or remove the entry from src/.vitepress/config/sidebar.ts.",
    );
}

const duplicates = navLinks.filter((l, i) => navLinks.indexOf(l) !== i);
if (duplicates.length) {
    fail(
        `${duplicates.length} sidebar entr(ies) are listed more than once:`,
        [...new Set(duplicates)],
        "Remove the duplicate from src/.vitepress/config/sidebar.ts.",
    );
}

console.log(`check:nav — ${pages.length} guide page(s), all reachable from the sidebar.`);
