// Port of xyz.columnal.utility.TranslationUtility (utility module).
// PORT-NOTE: Java loads ResourceBundles from the classpath; here the English .properties
// files are bundled at build time, in the same lookup order.
import type { LocalizableKey, Localized } from "../../anns/Annotations.js";
import { loadProperties } from "../../java/JavaProperties.js";
import { javaReplace } from "../../java/JavaString.js";
import { StyledString } from "../../utility-error/styled/StyledString.js";
import { Log } from "../log/Log.js";
import transformations from "@resources/i18n/transformations_en.properties?raw";
import expression from "@resources/i18n/expression_en.properties?raw";
import functions from "@resources/i18n/function_en.properties?raw";
import main from "@resources/i18n/main_en.properties?raw";
import newcolumn from "@resources/i18n/newcolumn_en.properties?raw";
import dataentry from "@resources/i18n/dataentry_en.properties?raw";
import importer from "@resources/i18n/import_en.properties?raw";

/**
 * Created by neil on 17/04/2017.
 */
export class TranslationUtility
{
    private static resources: readonly Map<string, string>[] | null = null;

    private static getResources(): readonly Map<string, string>[]
    {
        if (TranslationUtility.resources === null)
        {
            // Each of these corresponds to a <name>_en.properties file in the resources directory
            TranslationUtility.resources = [transformations, expression, functions, main, newcolumn, dataentry, importer].map(loadProperties);
        }
        return TranslationUtility.resources;
    }

    /**
     * Given a localization key (LHS in labels files), returns the localized value (RHS in labels files)
     *
     * If the key is not found, the key itself is returned as the string
     */
    public static getString(key: LocalizableKey, ...values: string[]): Localized
    {
        let lookedUp = TranslationUtility.loadString(key);
        if (lookedUp !== null)
        {
            for (let i = 0; i < values.length; i++)
            {
                lookedUp = javaReplace(lookedUp, "$" + (i + 1), values[i]!);
            }
            return lookedUp;
        }
        else
        {
            Log.error("Did not find translated key: \"" + key + "\"");
            return key; // Best we can do, if we can't find the labels file.
        }
    }

    private static loadString(key: LocalizableKey): Localized | null
    {
        for (const r of TranslationUtility.getResources())
        {
            const local = r.get(key);
            if (local !== undefined)
                return local;
        }
        return null;
    }

    public static getStyledString(key: LocalizableKey, ...values: string[]): StyledString
    {
        return StyledString.s(TranslationUtility.getString(key, ...values));
    }
}
