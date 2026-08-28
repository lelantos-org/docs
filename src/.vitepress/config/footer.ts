import { commitSha } from "./build-info.ts";

const GITHUB_MARK =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" role="img">' +
    "<title>GitHub</title>" +
    '<path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49l-.01-1.72c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 2.5-.34c.85 0 1.71.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.35 4.8-4.58 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.59.69.49A10.06 10.06 0 0 0 22 12.25C22 6.58 17.52 2 12 2z" />' +
    "</svg>";

const sep = '<span class="ftr__sep" aria-hidden="true"></span>';

const link = (href: string, body: string, label?: string) =>
    `<a class="ftr__link" href="${href}" target="_blank" rel="noopener noreferrer"` +
    `${label ? ` aria-label="${label}"` : ""}>${body}</a>`;

/**
 * The site footer, ported from explorer-ui's `Footer.tsx` so the three surfaces
 * carry the same row. Styling lives in `theme/footer.css`, ported from that
 * app's `layout.css`.
 *
 * VitePress renders only `message` and `copyright`, both of which accept raw
 * HTML, so the whole row goes in `message` and `copyright` is left unset.
 *
 * The `muted` / `mono` utility classes the explorer markup carries are
 * deliberately absent: they come from that app's `utilities.css`, which is not
 * ported here, so they resolved to nothing. `footer.css` styles `.ftr__note`
 * and `.ftr__ver` directly instead.
 */
export const footerMessage: string = [
    '<span class="ftr">',
    '<span class="ftr__brand">Lelantos</span>',
    sep,
    '<span class="ftr__note">no cookies 🍪 · no tracking 👁️ · no accounts 👤</span>',
    sep,
    link("https://app.lelantos.xyz", "wallet"),
    sep,
    link("https://explorer.lelantos.xyz", "explorer"),
    sep,
    `<span class="ftr__ver" title="build commit">${commitSha()}</span>`,
    sep,
    link("https://github.com/lelantos-org", GITHUB_MARK, "Lelantos on GitHub"),
    "</span>",
].join("");
