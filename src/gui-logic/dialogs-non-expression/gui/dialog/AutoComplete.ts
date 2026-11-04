// Port of the logic of xyz.columnal.gui.dialog.AutoComplete (dialogs-non-expression module): the
// completions offered below a text field as it is edited, the selected one, the keys which move the
// selection or choose, and choosing by double click.
//
// The field and its popup (the list, 30 px rows, at most 300 px high and 400 px wide, below the field)
// are in src/gui/components/AutoCompleteField.vue.
// PORT-NOTE: Java's completion text was an ObservableStringValue (for completions whose text depends on
// what is typed); here makeDisplay is given the current text when the list is shown.  Java's
// "autocomplete.instruction" popup was never shown (its showing was commented out), so isn't ported.
// PORT-DEFERRED: a completion's further details web page beside the list (getFurtherDetailsURL; no
// completion in the app has one).
import { javaTrim } from "../../../../engine/java/JavaString.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../engine/utility-error/error/UserException.js";
import { Log } from "../../../../engine/utility/log/Log.js";

export namespace AutoComplete
{
    export enum WhitespacePolicy
    {
        ALLOW_ANYWHERE,
        ALLOW_ONE_ANYWHERE_TRIM,
        DISALLOW,
    }

    export interface CompletionCalculator<C extends Completion>
    {
        calculateCompletions(textFieldContent: string): Iterable<C>;
    }

    export abstract class Completion
    {
        /**
         * Given the latest text, what text (and description) should we show for the item?
         */
        public abstract makeDisplay(currentText: string): CompletionContent;

        public _test_getContent(): string
        {
            return this.makeDisplay("").completion;
        }

        /**
         * How should we sort this item?  For functions, leave off brackets.
         *
         * @param text The current user-entered text (independent of this item)
         */
        public getDisplaySortKey(text: string): string
        {
            return this.makeDisplay(text).completion;
        }

        /**
         * Gets the URL of the details to show to the right of the list.  If null, nothing
         * is shown to the right.
         */
        public getFurtherDetailsURL(): string | null
        {
            return null;
        }
    }

    export class CompletionContent
    {
        public readonly description: string;

        public constructor(public readonly completion: string, description: string | null)
        {
            this.description = description ?? "";
        }
    }

    export class SimpleCompletion extends Completion
    {
        public constructor(protected readonly completion: string, private readonly description: string | null)
        {
            super();
        }

        public override makeDisplay(_currentText: string): CompletionContent
        {
            return new CompletionContent(this.completion, this.description);
        }
    }

    export interface CompletionListener<C extends Completion>
    {
        // Item was double-clicked in the list
        // Returns the new text for the textfield, or null if keep as-is
        doubleClick(currentText: string, selectedItem: C): string | null;

        // Enter or Tab used to select
        // Returns the new text for the textfield, or null if keep as-is
        keyboardSelect(textBeforeCaret: string, textAfterCaret: string, selectedItem: C | null, wasTab: boolean): string | null;
    }

    /** Java: the window's list, its selection, and what the keys and clicks do with them. */
    export class Model<C extends Completion>
    {
        private completionsValue: readonly C[] = [];
        private selectedIndex = -1;

        public constructor(private readonly calculateCompletions: CompletionCalculator<C>, private readonly onSelect: CompletionListener<C>, public readonly whitespacePolicy: WhitespacePolicy)
        {
        }

        public get completions(): readonly C[]
        {
            return this.completionsValue;
        }

        public getSelectedIndex(): number
        {
            return this.selectedIndex;
        }

        public getSelectedItem(): C | null
        {
            return this.completionsValue[this.selectedIndex] ?? null;
        }

        public select(index: number): void
        {
            this.selectedIndex = index;
        }

        // Java: AutoCompleteWindow.updateCompletions (the selection is cleared, as a ListView's is
        // when its items are replaced)
        public updateCompletions(text: string): readonly C[]
        {
            try
            {
                const calculated = [...this.calculateCompletions.calculateCompletions(text)];
                // (A stable sort, as Java's)
                const keys = new Map(calculated.map(c => [c, c.getDisplaySortKey(text)]));
                calculated.sort((a, b) => keys.get(a)! < keys.get(b)! ? -1 : keys.get(a)! > keys.get(b)! ? 1 : 0);
                this.completionsValue = calculated;
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException))
                    throw e;
                Log.log(e);
                this.completionsValue = [];
            }
            this.selectedIndex = -1;
            return this.completionsValue;
        }

        /** Java: the text formatter: the text the completions are calculated from (trimmed). */
        public static completionText(text: string): string
        {
            return javaTrim(text);
        }

        /**
         * Java: AutoCompleteWindow.textFieldKeyPressed, while the list is showing.  Returns whether the
         * key was used, and the new text (from choosing), and whether the list is to hide.
         */
        public keyPressed(key: string, text: string, caretPosition: number): { readonly consumed: boolean, readonly newText: string | null, readonly hide: boolean }
        {
            const PAGE = 9;
            const oldSel = this.selectedIndex;
            const count = this.completionsValue.length;
            switch (key)
            {
                case "Escape":
                    return { consumed: false, newText: null, hide: true };
                case "ArrowUp":
                case "PageUp":
                    if (oldSel <= 0)
                        this.selectedIndex = -1;
                    else if (key === "ArrowUp")
                        this.selectedIndex = oldSel - 1;
                    else
                        this.selectedIndex = Math.max(0, oldSel - PAGE);
                    return { consumed: true, newText: null, hide: false };
                case "ArrowDown":
                    if (oldSel < count - 1)
                        this.selectedIndex = oldSel + 1;
                    return { consumed: true, newText: null, hide: false };
                case "PageDown":
                    this.selectedIndex = Math.min(count - 1, oldSel + PAGE);
                    return { consumed: true, newText: null, hide: false };
                case "Enter":
                case "Tab":
                {
                    const newContent = this.onSelect.keyboardSelect(text.substring(0, caretPosition), text.substring(caretPosition), this.getSelectedItem(), key === "Tab");
                    return { consumed: true, newText: newContent, hide: true };
                }
                default:
                    return { consumed: false, newText: null, hide: false };
            }
        }

        /** Java: a double click on the list, with the item selected. */
        public doubleClick(text: string): string | null
        {
            const selectedItem = this.getSelectedItem();
            return selectedItem === null ? null : this.onSelect.doubleClick(text, selectedItem);
        }
    }
}
