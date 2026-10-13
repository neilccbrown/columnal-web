import { describe, expect, test } from "vitest";
import { TranslationUtility } from "../../../src/engine/utility/utility/TranslationUtility.js";

describe("TranslationUtility", () =>
{
    test("looks up keys in the bundled .properties files", () =>
    {
        expect(TranslationUtility.getString("us")).toBe("Columnal"); // main_en.properties
        expect(TranslationUtility.getStyledString("copy").toPlain()).toBe("Copy");
    });

    test("an unknown key is returned as itself", () =>
    {
        const originalError = console.error;
        console.error = () => {};
        try
        {
            expect(TranslationUtility.getString("no.such.key")).toBe("no.such.key");
        }
        finally
        {
            console.error = originalError;
        }
    });

    test("substitutes $1 literally, as Java's String.replace does", () =>
    {
        // JavaScript's replaceAll would expand "$&" in a replacement string
        expect(TranslationUtility.getString("importer.download.error", "a $& b")).toBe("Problem downloading: a $& b");
    });
});
