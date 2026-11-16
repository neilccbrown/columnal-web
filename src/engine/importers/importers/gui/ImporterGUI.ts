// Port of xyz.columnal.importers.gui.ImporterGUI (importers module): the model of a choice's row in the
// import dialog.
//
// PORT-NOTE: Java's makeGUI makes the row's JavaFX controls, bound to the choice.  Here it describes
// the row (ChoiceRow), which the GUI shows (ImportChoicesDialog.vue), and choose sets the choice from
// what the GUI picked; the logic (which items, which is selected, the "Other..." entry) is Java's.
import type { HelpKey, LocalizableKey, Localized } from "../../../anns/Annotations.js";
import type { SimpleObjectProperty } from "../../../java/JavaFXBeans.js";
import { TranslationUtility } from "../../../utility/utility/TranslationUtility.js";
import type { ChoiceDetails } from "../ChoiceDetails.js";

export namespace ImporterGUI
{
    /**
     * What a choice's row shows (Java: makeGUI's choiceNode): a label for none or one possible option,
     * else a combo box of the quick picks (as PickOrOther's text), with "Other..." last if a value can be
     * typed in, and which item is selected.
     */
    export type ChoiceRow =
        | { readonly kind: "label", readonly text: string }
        | { readonly kind: "combo", readonly items: readonly string[], readonly other: boolean, readonly selected: number, readonly otherText: string };

    /** Java: makeGUI: the row for the choice (setting the choice when it shows a label). */
    export function makeGUI<C>(choiceDetails: ChoiceDetails<C>, currentChoice: SimpleObjectProperty<C | null>): ChoiceRow
    {
        if (choiceDetails.quickPicks.length === 0 && choiceDetails.stringEntry === null)
        {
            // This is only if quick picks is empty and manual entry is not possible:
            currentChoice.set(null);
            return { kind: "label", text: "No possible options for " + TranslationUtility.getString(choiceDetails.getLabelKey()) };
        }
        else if (choiceDetails.quickPicks.length === 1 && choiceDetails.stringEntry === null)
        {
            // Only one option:
            currentChoice.set(choiceDetails.quickPicks[0]!);
            return { kind: "label", text: String(choiceDetails.quickPicks[0]) };
        }
        const items = choiceDetails.quickPicks.map(p => new PickOrOther(p).toString());
        const choice = currentChoice.get();
        if (choiceDetails.stringEntry !== null)
            items.push(new PickOrOther<C>().toString());
        // PORT-NOTE: bug fix: Java showed a choice that isn't one of the quick picks (e.g. a separator
        // guessed that isn't listed, or none) as the first item, while the choice itself stayed.  Here it
        // shows as "Other..." with its text (none matching the "" pick, as the text formats take "" as
        // none), or, if nothing can be typed, the first item is chosen.
        const index = choiceDetails.quickPicks.findIndex(p => choice === null ? p === "" : new PickOrOther(p).equals(new PickOrOther(choice)));
        if (index !== -1)
            return { kind: "combo", items, other: choiceDetails.stringEntry !== null, selected: index, otherText: "" };
        if (choiceDetails.stringEntry !== null)
            return { kind: "combo", items, other: true, selected: items.length - 1, otherText: choice === null ? "" : String(choice) };
        currentChoice.set(choiceDetails.quickPicks[0]!);
        return { kind: "combo", items, other: false, selected: 0, otherText: "" };
    }

    /**
     * Java: makeGUI's listeners on the combo box and the "Other..." field: the choice becomes the selected
     * quick pick, or for "Other..." (selected is the last index) the field's value if it converts (else
     * null).  Gives the field's error, if any.
     */
    export function choose<C>(choiceDetails: ChoiceDetails<C>, currentChoice: SimpleObjectProperty<C | null>, selected: number, otherText: string): Localized | null
    {
        if (selected < choiceDetails.quickPicks.length)
        {
            currentChoice.set(choiceDetails.quickPicks[selected]!);
            return null;
        }
        const stringEntry = choiceDetails.stringEntry;
        if (stringEntry === null)
            return null;
        return stringEntry(otherText).either<Localized | null>(e =>
        {
            currentChoice.set(null);
            return e;
        }, v =>
        {
            currentChoice.set(v);
            return null;
        });
    }

    // Either a value of type C, or an "Other" item
    // Public for testing
    export class PickOrOther<C>
    {
        private readonly value: C | null;

        public constructor(value: C | null = null)
        {
            this.value = value;
        }

        public equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof PickOrOther)) return false;
            const that = o as PickOrOther<unknown>;
            if (this.value === null || that.value === null)
                return this.value === that.value;
            return typeof (this.value as { equals?: unknown }).equals === "function" ? (this.value as unknown as { equals(x: unknown): boolean }).equals(that.value) : this.value === that.value;
        }

        public toString(): Localized
        {
            return this.value === null ? TranslationUtility.getString("import.choice.specify") : PickOrOther.convertInvisible(String(this.value));
        }

        private static convertInvisible(s: string): string
        {
            switch (s)
            {
                case " ": return "Space";
                case "\t": return "Tab";
                case "": return "None";
            }
            return s;
        }
    }
}

/** TS-only: a choice in the import dialog (Java: a row of an Import's getGUI). */
export type ImportChoice =
    // A choice of value (Java: ImporterGUI.makeGUI's row):
    | { readonly kind: "pick", readonly details: ChoiceDetails<unknown>, readonly choice: SimpleObjectProperty<unknown> }
    // A check box (Java: HTMLImporter's getGUI):
    | { readonly kind: "check", readonly labelKey: LocalizableKey, readonly helpKey: HelpKey, get(): boolean, set(checked: boolean): void };
