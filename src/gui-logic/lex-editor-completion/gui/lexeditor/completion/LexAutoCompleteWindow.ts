// Port of the logic of xyz.columnal.gui.lexeditor.completion.LexAutoCompleteWindow
// (lex-editor-completion module): the completion list, and which item is selected when the
// completions change.
//
// PORT-DEFERRED: the popup window (Phase 10, with the expression editor), with the list and a web
// view of the selected completion's further details, whose "insertable-expression" spans insert
// into the editor when clicked (enableInsertLinks).
import { LexAutoComplete } from "./LexAutoComplete.js";
import { LexCompletionList } from "./LexCompletionList.js";
import type { LexCompletionListener } from "./LexCompletionListener.js";
import type { LexCompletion } from "./LexCompletion.js";
import type { LexCompletionGroup } from "./LexCompletionGroup.js";
import { Pair } from "../../../../../engine/utility-adt/utility/adt/Pair.js";

// public for testing purposes
export class LexAutoCompleteWindow
{
    /** @internal Java: package-visible */
    public readonly listView: LexCompletionList;
    // Java: PopupControl's isShowing, show and hide
    private showing = false;

    public constructor(triggerCompletion: LexCompletionListener)
    {
        this.listView = new LexCompletionList(triggerCompletion);
    }

    public setCompletions(groups: readonly LexCompletionGroup[]): void
    {
        this.listView.setCompletions(groups);
        if ((groups.length >= 1 && groups[0]!.completions.length === 1 && groups[0]!.completions[0]!.selectionBehaviour === LexAutoComplete.LexSelectionBehaviour.SELECT_IF_ONLY)
            || (groups.length >= 1 && groups[0]!.completions.length >= 1 && groups[0]!.completions[0]!.selectionBehaviour === LexAutoComplete.LexSelectionBehaviour.SELECT_IF_TOP))
        {
            this.listView.select(new Pair(0, 0));
        }
    }

    public _test_getSelectedContent(): string | null
    {
        const selectedItem = this.listView.getSelectedItem();
        if (selectedItem === null)
            return null;
        else
            return selectedItem.content;
    }

    public _test_getShowing(): readonly LexCompletion[]
    {
        return this.listView.getItems();
    }

    public isShowing(): boolean
    {
        return this.showing;
    }

    public show(): void
    {
        this.showing = true;
    }

    public hide(): void
    {
        this.showing = false;
    }
}
