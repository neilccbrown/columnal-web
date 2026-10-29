// Port of xyz.columnal.utility.gui.Help (utility-gui module): loads the dialog help.
//
// PORT-NOTE: Java loads a ResourceBundle per help file, which the build made from the help XML
// (make-help-indiv.xsl).  Here the build makes the same .properties files (scripts/gen-funcdoc.mjs),
// and they are bundled.  As in Java, a help key that isn't there throws (Java's HelpKey checker
// ensures they are all there).
import type { HelpKey, LocalizableKey, Localized } from "../../../../engine/anns/Annotations.js";
import { javaSplit } from "../../../../engine/java/JavaString.js";
import { loadProperties } from "../../../../engine/java/JavaProperties.js";
import { GrammarUtility } from "../../../../engine/parsers/grammar/GrammarUtility.js";

// By file name stem (the dialog's id), e.g. "edit-join":
const files: Record<string, string> = Object.fromEntries(
    Object.entries(import.meta.glob<string>("../../generated/help/*_en.properties", { query: "?raw", import: "default", eager: true }))
        .map(([path, content]) => [path.replace(/^.*\//, "").replace(/_en\.properties$/, ""), content]));

/**
 * Class for loading help information
 */
export class Help
{
    // Maps file names (minus extension) to
    // help item names to help info
    private static readonly helpCache = new Map<string, Help.HelpInfo>();
    private static readonly bundles = new Map<string, Map<string, string>>();

    private static loadFile(fileStem: string, id: string): Help.HelpInfo
    {
        const resourceBundle = Help.getBundle(fileStem);

        const titleKey: LocalizableKey = id + ".title";
        const shortKey: LocalizableKey = id;
        const fullKey: LocalizableKey = id + ".full";
        const split = javaSplit(GrammarUtility.collapseSpaces(Help.getString(resourceBundle, fileStem, fullKey)), /£££££/);
        return new Help.HelpInfo(Help.getString(resourceBundle, fileStem, titleKey), Help.getString(resourceBundle, fileStem, shortKey), split);
    }

    private static getBundle(fileStem: string): Map<string, string>
    {
        let bundle = Help.bundles.get(fileStem);
        if (bundle === undefined)
        {
            const content = files[fileStem];
            if (content === undefined)
                throw new Error("Can't find help bundle " + fileStem);
            bundle = loadProperties(content);
            Help.bundles.set(fileStem, bundle);
        }
        return bundle;
    }

    private static getString(bundle: Map<string, string>, fileStem: string, key: string): Localized
    {
        const value = bundle.get(key);
        if (value === undefined)
            throw new Error("Can't find key " + key + " in help bundle " + fileStem);
        return value;
    }

    public static getHelpInfo(helpKey: HelpKey): Help.HelpInfo | null
    {
        const rootAndEntry = helpKey.split("/");
        const cacheKey = rootAndEntry[0]! + "/" + rootAndEntry[1]!;
        let info = Help.helpCache.get(cacheKey);
        if (info === undefined)
        {
            info = Help.loadFile(rootAndEntry[0]!, rootAndEntry[1]!);
            Help.helpCache.set(cacheKey, info);
        }
        return info;
    }
}

export namespace Help
{
    export class HelpInfo
    {
        public readonly title: Localized;
        public readonly shortText: Localized;
        public readonly fullParas: readonly Localized[];

        public constructor(title: Localized, shortText: Localized, fullParas: readonly Localized[])
        {
            this.title = title;
            this.shortText = shortText;
            this.fullParas = fullParas;
        }
    }
}
