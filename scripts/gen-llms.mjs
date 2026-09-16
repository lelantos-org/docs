// The site again, as plain markdown for language models.
//
// Follows the llms.txt convention (https://llmstxt.org). Written into the built
// site after `vitepress build`, so it deploys with everything else:
//
//   /llms.txt           index: every guide page and reference module, one line each
//   /llms-full.txt      the whole guide in sidebar order, one file
//   /guide/<page>.md    each guide page on its own
//   /reference/**.md    each reference page on its own
//
// The HTML is the wrong thing to hand a model: the navigation, the Twoslash
// hover types and the theme chrome cost far more tokens than the prose. The
// source markdown is closer but not right either — it is written for VitePress,
// and three of its conventions mislead a reader that takes it literally:
//
//   - Twoslash cut regions. The setup above `// ---cut---` or between
//     `---cut-start---` / `---cut-end---` is hidden on the site, where the
//     hover types stand in for it. In text nothing stands in for it: drop it
//     and `wallet` or `quote` arrive undefined, with no import saying which
//     subpath a symbol comes from — exactly what a model gets wrong. So the
//     setup is kept, under a `// setup` label, and the example is the whole
//     program the build typechecked. (Setups are `declare`d inputs —
//     `wallet`, `privateKey`, `rpcUrl` — standing in for the caller's own.)
//   - Twoslash directives (`// ^?`, `// @errors: …`) render as tooltips on the
//     site and read as noise, or worse as instructions, in text.
//   - Custom containers (`::: warning`) are not markdown; they become quotes.
//
// Links become absolute `.md` URLs, so a model fetching one page can follow it
// to the next without meeting HTML.
//
// The reference is not in llms-full.txt: at ~740KB it would crowd out the guide
// in any context it fits in. TypeDoc already emits clean markdown, so its pages
// are copied as-is and listed per module in llms.txt.
//
// Run: npm run gen:llms (after `vitepress build`; `npm run build` does both)

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { guideSidebar } from "../src/.vitepress/config/sidebar.ts";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL as SITE } from "../src/.vitepress/config/site.ts";
import { fail, fences, read, ROOT } from "./lib/docs.mjs";
import { sdkPackage } from "./lib/sdk.mjs";

const DIST = join(ROOT, "src/.vitepress/dist");
const { manifest } = sdkPackage();

if (!existsSync(DIST)) {
    fail("gen:llms — no built site to write into:", [DIST], "Run `vitepress build src` first.");
}

function writeOut(path, content) {
    const file = join(DIST, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
}

// ── cleaning ──────────────────────────────────────────────────────────────────

const CUT = /^\s*\/\/ ---cut---\s*$/;
const CUT_START = /^\s*\/\/ ---cut-start---\s*$/;
const CUT_END = /^\s*\/\/ ---cut-end---\s*$/;
// `// ^?` queries and `// @errors: 2345`-style flags. Flags are matched as
// `@word:` or `@noErrors` so a comment naming a package (`// @lelantos-org/…`)
// survives.
const DIRECTIVE = /^\s*\/\/\s*(\^[?|!]|@\w+:|@noErrors\b)/;

/**
 * A Twoslash fence body as the program Twoslash compiled: hidden setup kept and
 * labelled, markers and tooltip directives dropped.
 */
function cleanTwoslash(body) {
    const out = [];
    const label = (text) => {
        while (out.length && !out.at(-1).trim()) out.pop();
        if (out.length) out.push("");
        out.push(text);
    };
    if (body.some((l) => CUT.test(l))) label("// setup");
    for (const line of body) {
        if (CUT.test(line) || CUT_END.test(line)) label("// example");
        else if (CUT_START.test(line)) label("// setup");
        else if (DIRECTIVE.test(line)) continue;
        // A blank line straight under a label would detach it from its code.
        else if (line.trim() || !/^\/\/ (setup|example)$/.test(out.at(-1) ?? "")) out.push(line);
    }
    // A label with no code under it — a cut marker at the edge of a block.
    while (out.length && /^\/\/ (setup|example)$|^$/.test(out.at(-1))) out.pop();
    return out;
}

/** `/guide/foo#bar` -> `https://docs.lelantos.xyz/guide/foo.md#bar`. */
function absoluteLink(href) {
    const m = /^(\/(?:guide|reference)\/[^#)\s]*?)(\.md)?(#[^)\s]*)?$/.exec(href);
    if (!m) return href;
    const path = m[1].endsWith("/") ? `${m[1]}index` : m[1];
    return `${SITE}${path}.md${m[3] ?? ""}`;
}

/** A guide page's source, rewritten as plain markdown. */
function cleanGuide(md) {
    const source = md.replace(/^---\n[\s\S]*?\n---\n/, "");
    const lines = source.split("\n");
    const blocks = new Map(fences(source).map((f) => [f.start, f]));
    const out = [];
    let quote = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code is copied, never rewritten: links and containers inside a fence
        // are its content.
        const fence = blocks.get(i);
        if (fence) {
            const { indent, lang, attrs, body } = fence;
            const kept = /\btwoslash\b/.test(attrs) ? cleanTwoslash(body) : body;
            const prefix = quote ? "> " : "";
            for (const l of [`${indent}\`\`\`${lang}`, ...kept, `${indent}\`\`\``]) {
                out.push(`${prefix}${l}`.trimEnd());
            }
            i = fence.end;
            continue;
        }

        if (/^\s*<!--\s*typecheck:[^>]*-->\s*$/.test(line)) continue;

        const open = /^:::\s*(tip|info|warning|danger|details|note)\b\s*(.*)$/.exec(line);
        if (open) {
            const kind = open[1][0].toUpperCase() + open[1].slice(1);
            out.push(`> **${open[2] ? `${kind}: ${open[2]}` : kind}**`, ">");
            quote = true;
            continue;
        }
        if (quote && /^:::\s*$/.test(line)) {
            quote = false;
            continue;
        }

        const linked = line.replace(/\]\(([^)\s]+)\)/g, (_, href) => `](${absoluteLink(href)})`);
        out.push(quote ? `> ${linked}`.trimEnd() : linked);
    }
    return `${out
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()}\n`;
}

/** First sentence of the first prose paragraph, for the llms.txt index. */
function summary(md) {
    const para = md
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p && !/^(#|```|>|:::|<|\||-|\*|\d+\.)/.test(p));
    if (!para) return "";
    const flat = para
        .replace(/\s+/g, " ")
        .replace(/\]\([^)]*\)/g, "]")
        .replace(/\[([^\]]*)\]/g, "$1");
    return /^.*?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
}

// ── guide ─────────────────────────────────────────────────────────────────────

const sections = guideSidebar.map((group) => ({
    title: group.text,
    pages: (group.items ?? []).map((item) => {
        const path = item.link;
        const md = cleanGuide(read(`src${path}.md`));
        writeOut(`${path}.md`, md);
        return { title: item.text, path, md };
    }),
}));

// The guarantee this script exists for: nothing VitePress-only reaches a model.
const leaks = sections.flatMap((s) =>
    s.pages.flatMap((p) =>
        p.md
            .split("\n")
            .map((l, i) => [l, i])
            .filter(([l]) =>
                /---cut(-start|-end)?---|\/\/\s*\^\?|^>?\s*:::|```\w+\s+twoslash/.test(l),
            )
            .map(([l, i]) => `${p.path}.md:${i + 1}  ${l.trim()}`),
    ),
);
if (leaks.length) {
    fail(
        `gen:llms — ${leaks.length} VitePress-only line(s) survived cleaning:`,
        leaks,
        "Extend cleanGuide() in scripts/gen-llms.mjs to handle the new syntax.",
    );
}

// ── reference ─────────────────────────────────────────────────────────────────

cpSync(join(ROOT, "src/reference"), join(DIST, "reference"), {
    recursive: true,
    filter: (src) => !src.endsWith(".json"),
});

// Module list from TypeDoc's own index, so it cannot drift from the reference.
const modules = [...read("src/reference/index.md").matchAll(/^- \[([^\]]+)\]\(([^)]+)\)$/gm)].map(
    ([, name, href]) => ({ name, href }),
);
if (!modules.length) {
    fail(
        "gen:llms — no modules found in src/reference/index.md",
        [],
        "Did TypeDoc's output change?",
    );
}

// ── index files ───────────────────────────────────────────────────────────────

const link = (title, path, note) => `- [${title}](${SITE}${path})${note ? `: ${note}` : ""}`;

const llmsTxt = [
    `# ${SITE_TITLE}`,
    "",
    `> ${SITE_DESCRIPTION} TypeScript, published as \`@lelantos-org/sdk\` ` +
        `(this documentation describes v${manifest.version}).`,
    "",
    "Every page below is plain markdown. Start with Concepts and Quickstart; the whole guide is " +
        `also available as a single file at ${SITE}/llms-full.txt. ` +
        "Every TypeScript example is typechecked against this SDK version at build time; lines " +
        "under `// setup` are scaffolding (`declare`d inputs standing in for your own values), the rest is the " +
        "usage being shown. Import from the subpath an example uses — subpaths are part of the API.",
    "",
    ...sections.flatMap((s) => [
        `## ${s.title}`,
        "",
        ...s.pages.map((p) => link(p.title, `${p.path}.md`, summary(p.md))),
        "",
    ]),
    "## API reference",
    "",
    "Generated from the package's type declarations, one page per export.",
    "",
    ...modules.map((m) =>
        link(`@lelantos-org/sdk${m.name === "index" ? "" : `/${m.name}`}`, `/reference/${m.href}`),
    ),
    "",
    "## Optional",
    "",
    link("Full guide", "/llms-full.txt", "every guide page above, concatenated"),
    link("Reference index", "/reference/index.md"),
    "",
].join("\n");

const llmsFull = [
    `# ${SITE_TITLE} — guide (v${manifest.version})`,
    "",
    `> Source: ${SITE}. API reference: ${SITE}/reference/index.md`,
    "",
    ...sections.flatMap((s) =>
        s.pages.map((p) => `<!-- ${SITE}${p.path}.md -->\n\n${p.md.trim()}\n`),
    ),
].join("\n");

writeOut("/llms.txt", llmsTxt);
writeOut("/llms-full.txt", llmsFull);

const pages = sections.reduce((n, s) => n + s.pages.length, 0);
const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)}KB`;
console.log(
    `gen:llms — llms.txt (${kb(llmsTxt)}), llms-full.txt (${kb(llmsFull)}, ${pages} guide pages), ` +
        `${modules.length} reference modules.`,
);
