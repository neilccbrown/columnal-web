// Port of the logic of xyz.columnal.gui.lexeditor.completion.LexAutoComplete (lex-editor-completion
// module): showing and hiding the completions, moving the selection, and the selected completion.
//
// PORT-NOTE: Java shows the window after the next layout, positioned below the caret on screen,
// and only if there are completions (and the caret is on screen), keeping the position updated
// on a timer; here show() shows it if there are completions.  The positioning, its
// EditorDisplayInterface, and the immunity of clicks for 400ms after a click hides it, are left
// to the GUI (Phase 10, with the expression editor).
import type { LexCompletion } from "./LexCompletion.js";
import { LexAutoCompleteWindow } from "./LexAutoCompleteWindow.js";
import type { LexCompletionGroup } from "./LexCompletionGroup.js";
import type { LexCompletionListener } from "./LexCompletionListener.js";

export class LexAutoComplete
{
    private readonly window: LexAutoCompleteWindow;

    public constructor(triggerCompletion: LexCompletionListener)
    {
        this.window = new LexAutoCompleteWindow(triggerCompletion);
    }

    public show(groups: readonly LexCompletionGroup[]): void
    {
        this.window.setCompletions(groups);
        // Java: updateWindowPosition, after the next layout:
        if (this.window.listView.getItems().length !== 0)
            this.window.show();
        else
            this.hide(false);
    }

    /** PORT-NOTE: becauseOfMouseClick makes clicks immune for a while, which is left to the GUI. */
    public hide(_becauseOfMouseClick: boolean): void
    {
        this.window.hide();
        this.window.setCompletions([]);
    }

    public isShowing(): boolean
    {
        return this.window.isShowing();
    }

    public down(): void
    {
        this.window.listView.down();
    }

    public up(): void
    {
        this.window.listView.up();
    }

    public pageDown(): void
    {
        this.window.listView.pageDown();
    }

    public pageUp(): void
    {
        this.window.listView.pageUp();
    }

    // Java: returns Optional<LexCompletion>
    public getSelectedCompletion(): LexCompletion | null
    {
        return this.window.listView.getSelectedItem();
    }

    /** For the tests: Java's tests find the LexAutoCompleteWindow among the open windows. */
    public _test_getWindow(): LexAutoCompleteWindow | null
    {
        return this.window.isShowing() ? this.window : null;
    }
}

export namespace LexAutoComplete
{
    export enum LexSelectionBehaviour
    {
        SELECT_IF_ONLY,
        SELECT_IF_TOP,
        NO_AUTO_SELECT,
    }
}
