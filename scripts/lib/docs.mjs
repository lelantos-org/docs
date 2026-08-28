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
        exclude: (p) => p.includes("reference"),
    })) {
        out.push(file);
    }
    return out.sort();
}

const FENCE = /^```(ts|typescript)\b(.*)$/;
const SKIP = /<!--\s*typecheck:\s*skip\s*-->/;

/**
 * Every TypeScript fence in a markdown document.
 *
 * The opening pattern is `^```(ts|typescript)\b` rather than the SDK's
 * `\s*$`: attribute-carrying fences (```ts twoslash, ```ts{3,5}) must be seen,
 * not silently ignored — being ignored is the failure this scanner exists to
 * catch. Returns `{ line, lang, attrs, twoslash, skipped }` per fence.
 */
export function tsFences(md) {
    const lines = md.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const m = FENCE.exec(lines[i]);
        if (!m) continue;
        const attrs = m[2] ?? "";
        out.push({
            line: i + 1,
            lang: m[1],
            attrs,
            twoslash: /\btwoslash\b/.test(attrs),
            skipped: i > 0 && SKIP.test(lines[i - 1]),
        });
        // Advance past the closing fence so nested content is not rescanned.
        while (i < lines.length && !/^```\s*$/.test(lines[++i])) {
            /* advance */
        }
    }
    return out;
}

/** Print a failure with its remedy and exit non-zero. */
export function fail(headline, items, remedy) {
    console.error(`\n${headline}\n`);
    for (const item of items) console.error(`  ${item}`);
    if (remedy) console.error(`\n${remedy}\n`);
    process.exit(1);
}
