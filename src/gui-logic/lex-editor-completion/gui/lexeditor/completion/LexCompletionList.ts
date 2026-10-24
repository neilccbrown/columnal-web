// Port of the logic of xyz.columnal.gui.lexeditor.completion.LexCompletionList
// (lex-editor-completion module): the list of completion groups shown, and the selected item.
//
// PORT-DEFERRED: the list as a view (Phase 10, with the expression editor): its rows, group
// headers, scrolling and animation, and the mouse (clickOnItem's choosing is here).
import { SimpleObjectProperty, type ObjectExpression } from "../../../../../engine/java/JavaFXBeans.js";
import { Pair } from "../../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../engine/utility-error/error/InternalException.js";
import { Log } from "../../../../../engine/utility/log/Log.js";
import { Utility } from "../../../../../engine/utility/utility/Utility.js";
import type { LexCompletion } from "./LexCompletion.js";
import type { LexCompletionGroup } from "./LexCompletionGroup.js";
import type { LexCompletionListener } from "./LexCompletionListener.js";

export class LexCompletionList
{
    private readonly triggerCompletion: LexCompletionListener;
    private curCompletionGroups: readonly LexCompletionGroup[] = [];
    // Java: an IdentityHashMap
    private readonly completionIndexes = new Map<LexCompletion, Pair<number, number>>();

    // Group index, item index within group
    private selectionIndex: Pair<number, number> | null = null;
    // Will be the selected item at selectionIndex
    private readonly selectedItem = new SimpleObjectProperty<LexCompletion | null>(null);

    public constructor(triggerCompletion: LexCompletionListener)
    {
        this.triggerCompletion = triggerCompletion;
    }

    /** @internal Java: protected, called when a row is clicked */
    public clickOnItem(clickCount: number, target: Pair<number, number>): void
    {
        const wasAlreadySelected = this.selectionIndex !== null && this.selectionIndex.equals(target);
        if (clickCount >= 1)
        {
            this.select(target);
        }

        // Clicking twice slowly also works this way:
        const sel = this.selectedItem.get();
        if ((clickCount === 2 || wasAlreadySelected) && sel !== null)
            this.triggerCompletion.complete(sel);
    }

    /** PORT-NOTE: Java also resets the group animations and scrolling here. */
    public setCompletions(completions: readonly LexCompletionGroup[]): void
    {
        this.curCompletionGroups = completions;

        this.completionIndexes.clear();
        try
        {
            for (let i = 0; i < this.curCompletionGroups.length; i++)
            {
                for (let j = 0; j < this.curCompletionGroups[i]!.completions.length; j++)
                {
                    const completion = this.curCompletionGroups[i]!.completions[j]!;
                    const had = this.completionIndexes.has(completion);
                    this.completionIndexes.set(completion, new Pair(i, j));
                    if (had)
                    {
                        throw new InternalException("Duplicate entry: " + String(this.curCompletionGroups[i]));
                    }
                }
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            // We shouldn't have duplicate completions, but don't let such an exception propagate:
            Log.log(e);
        }

        // Keep same item selected, if still present:
        const sel = this.selectedItem.get();
        const target = sel === null ? null : this.completionIndexes.get(sel) ?? null;
        this.select(target);
    }

    /** PORT-NOTE: Java also scrolls to show the selected item. */
    public select(target: Pair<number, number> | null): void
    {
        this.selectionIndex = target;
        this.selectedItem.set(target === null ? null : this.curCompletionGroups[target.getFirst()]!.completions[target.getSecond()]!);
    }

    public getSelectedItem(): LexCompletion | null
    {
        return this.selectedItem.get();
    }

    public up(): void
    {
        if (this.selectionIndex !== null)
        {
            if (this.selectionIndex.getSecond() > 0)
                this.select(this.selectionIndex.mapSecond(n => n - 1));
            else
            {
                const prevNonEmpty = Utility.findLastIndex(this.curCompletionGroups.slice(0, this.selectionIndex.getFirst()), g => g.completions.length !== 0);
                if (prevNonEmpty !== null)
                    this.select(new Pair(prevNonEmpty, this.curCompletionGroups[prevNonEmpty]!.completions.length - 1));
                else
                    this.select(null);
            }
        }
    }

    public down(): void
    {
        if (this.selectionIndex === null)
        {
            const firstNonEmpty = Utility.findFirstIndex(this.curCompletionGroups, g => g.completions.length !== 0);
            if (firstNonEmpty !== null)
                this.select(new Pair(firstNonEmpty, 0));
        }
        else
        {
            if (this.selectionIndex.getSecond() < this.curCompletionGroups[this.selectionIndex.getFirst()]!.completions.length - 1)
                this.select(this.selectionIndex.mapSecond(n => n + 1));
            else if (this.selectionIndex.getFirst() < this.curCompletionGroups.length - 1 && this.curCompletionGroups[this.selectionIndex.getFirst() + 1]!.completions.length !== 0)
                this.select(new Pair(this.selectionIndex.getFirst() + 1, 0));
        }
    }

    public pageUp(): void
    {
        if (this.selectionIndex !== null)
        {
            const prevNonEmpty = Utility.findLastIndex(this.curCompletionGroups.slice(0, this.selectionIndex.getFirst()), g => g.completions.length !== 0);
            if (prevNonEmpty !== null)
            {
                this.select(new Pair(prevNonEmpty, 0));
            }
            else
            {
                this.select(null);
            }
        }
    }

    public pageDown(): void
    {
        if (this.selectionIndex === null)
        {
            const firstNonEmpty = Utility.findFirstIndex(this.curCompletionGroups, g => g.completions.length !== 0);
            if (firstNonEmpty !== null)
                this.select(new Pair(firstNonEmpty, 0));
        }
        else
        {
            const next = this.selectionIndex.getFirst() + 1;
            const nextNonEmpty = Utility.findFirstIndex(this.curCompletionGroups.slice(next), g => g.completions.length !== 0);
            if (nextNonEmpty !== null)
                this.select(new Pair(nextNonEmpty + next, 0));
            // else do nothing
        }
    }

    public getItems(): LexCompletion[]
    {
        return this.curCompletionGroups.flatMap(c => c.completions);
    }

    public selectedItemProperty(): ObjectExpression<LexCompletion | null>
    {
        return this.selectedItem;
    }
}
