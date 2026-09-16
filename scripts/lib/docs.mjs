// Shared helpers for the gates that read this site's markdown.

import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export const read = (file) => readFileSync(join(ROOT, file), "utf8");

/**
 * Hand-written pages, repo-relative.
 *
 * `src/reference/**` is excluded everywhere it appears: it is TypeDoc output,
 * so its fences are signature fragments rather than programs and its pages are
 * navigated by the generated sidebar, not the hand-written one.
 */
export async function guidePages() {
    const out = [];
    for await (const file of glob("src/**/*.md", {
        cwd: ROOT,
        // A prefix, not a substring: a guide page named `references.md` is
        // hand-written and must still be checked.
        exclude: (p) => p === "src/reference" || p.startsWith("src/reference/"),
    })) {
        out.push(file);
    }
    return out.sort();
}

const OPEN = /^(\s*)```(\w*)(.*)$/;
const CLOSE = /^\s*```\s*$/;
const SKIP = /<!--\s*typecheck:\s*skip\s*-->/;

/**
 * Every fenced code block in a markdown document, in order.
 *
 * `start` and `end` are the 0-based line indexes of the opening and closing
 * fence; `body` is the lines between. Opening fences may be indented, since a
 * fence inside a list item is indented and is still a fence. Walking whole
 * blocks, rather than matching openings line by line, means a fence quoted
 * inside another block is content, not a block of its own.
 *
 * The one place that parses fences: `check:fences` and `gen:llms` both read
 * through it, so they cannot disagree about where a block begins or ends.
 */
export function fences(md) {
    const lines = md.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const m = OPEN.exec(lines[i]);
        if (!m) continue;
        const start = i;
        while (i + 1 < lines.length && !CLOSE.test(lines[i + 1])) i++;
        const end = Math.min(i + 1, lines.length);
        out.push({
            start,
            end,
            indent: m[1],
            lang: m[2],
            attrs: m[3],
            body: lines.slice(start + 1, end),
        });
        i = end;
    }
    return out;
}

/**
 * Every TypeScript fence in a markdown document.
 *
 * Attribute-carrying fences (```ts twoslash, ```ts{3,5}) must be seen, not
 * silently ignored — being ignored is the failure this scanner exists to catch.
 * Returns `{ line, lang, attrs, twoslash, skipped }` per fence.
 */
export function tsFences(md) {
    const lines = md.split("\n");
    return fences(md)
        .filter((f) => f.lang === "ts" || f.lang === "typescript")
        .map((f) => ({
            line: f.start + 1,
            lang: f.lang,
            attrs: f.attrs,
            twoslash: /\btwoslash\b/.test(f.attrs),
            skipped: f.start > 0 && SKIP.test(lines[f.start - 1]),
        }));
}

/** Print a failure with its remedy and exit non-zero. */
export function fail(headline, items, remedy) {
    console.error(`\n${headline}\n`);
    for (const item of items) console.error(`  ${item}`);
    if (remedy) console.error(`\n${remedy}\n`);
    process.exit(1);
}
