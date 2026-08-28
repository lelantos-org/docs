import TwoslashFloatingVue from "@shikijs/vitepress-twoslash/client";
import type { EnhanceAppContext } from "vitepress";
import DefaultTheme from "vitepress/theme";
import "@shikijs/vitepress-twoslash/style.css";
import "./tokens.css";
import "./footer.css";

export default {
    extends: DefaultTheme,
    enhanceApp({ app }: EnhanceAppContext) {
        // Renders the hover type tooltips Twoslash emits into the markup.
        app.use(TwoslashFloatingVue);
    },
};
