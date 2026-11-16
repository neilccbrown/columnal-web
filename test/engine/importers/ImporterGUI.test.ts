// The model of the import dialog's choice rows (src/engine/importers/importers/gui/ImporterGUI.ts, Java's
// ImporterGUI.makeGUI and PickOrOther), and the text import's choices (GuessFormat's getChoices).
import { describe, expect, test } from "vitest";
import { ChoiceDetails } from "../../../src/engine/importers/importers/ChoiceDetails.js";
import { GuessFormat } from "../../../src/engine/importers/importers/GuessFormat.js";
import { ImporterGUI } from "../../../src/engine/importers/importers/gui/ImporterGUI.js";
import { SimpleObjectProperty } from "../../../src/engine/java/JavaFXBeans.js";
import { Charset } from "../../../src/engine/java/JavaCharset.js";
import { DummyManager } from "../tests-functions/fixtures/DummyManager.js";

const details = (picks: string[], entry: boolean): ChoiceDetails<string> =>
    new ChoiceDetails<string>("guess.separator", "guess-format/separator", picks, entry ? GuessFormat.separatorChoiceDetails().stringEntry : null);

describe("ImporterGUI.makeGUI", () =>
{
    test("no options: a label saying so, and no choice", () =>
    {
        const choice = new SimpleObjectProperty<string | null>("x");
        expect(ImporterGUI.makeGUI(details([], false), choice)).toEqual({ kind: "label", text: "No possible options for Column separator" });
        expect(choice.get()).toBeNull();
    });

    test("one option: a label of it, and it is chosen", () =>
    {
        const choice = new SimpleObjectProperty<string | null>(null);
        expect(ImporterGUI.makeGUI(details([";"], false), choice)).toEqual({ kind: "label", text: ";" });
        expect(choice.get()).toBe(";");
    });

    test("otherwise a combo box: the picks (invisible ones named), then Other... if a value can be typed; the choice selected", () =>
    {
        const choice = new SimpleObjectProperty<string | null>("\t");
        expect(ImporterGUI.makeGUI(details([",", "\t", " ", ""], true), choice)).toEqual({ kind: "combo", items: [",", "Tab", "Space", "None", "Other..."], other: true, selected: 1, otherText: "" });
    });

    test("a choice that isn't a pick shows as Other..., with its text (none as the \"\" pick); with no Other..., the first is chosen", () =>
    {
        const choice = new SimpleObjectProperty<string | null>("#");
        expect(ImporterGUI.makeGUI(details([",", ";"], true), choice)).toEqual({ kind: "combo", items: [",", ";", "Other..."], other: true, selected: 2, otherText: "#" });
        expect(choice.get()).toBe("#");
        const none = new SimpleObjectProperty<string | null>(null);
        expect(ImporterGUI.makeGUI(details([",", ""], true), none)).toMatchObject({ selected: 1, otherText: "" });
        expect(ImporterGUI.makeGUI(details([",", ";"], true), none)).toMatchObject({ selected: 2, otherText: "" });
        const fixed = new SimpleObjectProperty<string | null>("#");
        expect(ImporterGUI.makeGUI(details([",", ";"], false), fixed)).toMatchObject({ selected: 0 });
        expect(fixed.get()).toBe(",");
    });
});

describe("ImporterGUI.choose", () =>
{
    test("a pick is chosen; Other... chooses the text typed if it converts, else nothing (with the error)", () =>
    {
        const d = details([",", ";"], true);
        const choice = new SimpleObjectProperty<string | null>(",");
        expect(ImporterGUI.choose(d, choice, 1, "")).toBeNull();
        expect(choice.get()).toBe(";");
        expect(ImporterGUI.choose(d, choice, 2, "|")).toBeNull();
        expect(choice.get()).toBe("|");
        const error = ImporterGUI.choose(d, choice, 2, "ab");
        expect(error).not.toBeNull();
        expect(error).toBe(GuessFormat.separatorChoiceDetails().stringEntry!("ab").either(e => e, () => ""));
        expect(choice.get()).toBeNull();
    });
});

describe("The text import's choices", () =>
{
    test("encoding, separator and quote; changing one changes the source format", () =>
    {
        const imp = GuessFormat.guessTextFormat(DummyManager.make().getTypeManager(), DummyManager.make().getUnitManager(), new Map([[Charset.UTF_8, ["a,b", "1,2"]]]), null, null);
        const choices = imp.getChoices!();
        expect(choices.map(c => c.kind === "pick" ? c.details.getLabelKey() : c.labelKey)).toEqual(["guess.charset", "guess.separator", "guess.quote"]);
        expect(imp.currentSrcFormat().get()?.separator).toBe(",");
        const separator = choices[1]!;
        if (separator.kind !== "pick")
            throw new Error("Not a pick");
        separator.choice.set(";");
        expect(imp.currentSrcFormat().get()?.separator).toBe(";");
    });
});
