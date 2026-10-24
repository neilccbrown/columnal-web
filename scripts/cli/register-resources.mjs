// Lets Node (with tsx) run engine code outside Vite, by loading the engine's
// "@resources/...?raw" imports (a Vite alias and query) as Vite does: "@resources/<path>" is
// resources/<path>, and an import with "?raw" is a module whose default export is the file's text.
//   node --import tsx --import ./scripts/cli/register-resources.mjs <script.ts>
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

const RESOURCES = new URL("../../resources/", import.meta.url);

registerHooks({
    resolve(specifier, context, nextResolve)
    {
        if (specifier.startsWith("@resources/"))
        {
            const [path, query] = specifier.substring("@resources/".length).split("?");
            return { url: new URL(path, RESOURCES).href + (query !== undefined ? "?" + query : ""), shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },

    load(url, context, nextLoad)
    {
        if (url.endsWith("?raw"))
        {
            const text = readFileSync(new URL(url.substring(0, url.length - "?raw".length)), "utf8");
            return { format: "module", source: "export default " + JSON.stringify(text) + ";", shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});
