// Port of the logic of xyz.columnal.gui.lexeditor.completion.LexCompletionList
// (lex-editor-completion module): the list of completion groups shown, and the selected item.
//
// The list as a view (its rows, group headers, the scroll bar and the mouse; clickOnItem's choosing is
// here) is in src/gui/lexeditor/LexAutoCompleteWindow.vue, which shows the rows where getGroupTopY puts
// them: each group's first rows (its minCollapsed) stay on screen as the list scrolls, the later groups
// over the end of the earlier ones.
// PORT-NOTE: Java animated the groups to their new places when the list was scrolled by the mouse
// wheel; the browser's scrolling is smooth itself, so that isn't ported (nor Java's limiting of the
// rows laid out to those near the screen, which was an optimisation).
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
    public static readonly ITEM_HEIGHT = 24;
    private readonly triggerCompletion: LexCompletionListener;
    private curCompletionGroups: readonly LexCompletionGroup[] = [];
    // Java: an IdentityHashMap
    private readonly completionIndexes = new Map<LexCompletion, Pair<number, number>>();

    // Group index, item index within group
    private selectionIndex: Pair<number, number> | null = null;
    // Will be the selected item at selectionIndex
    private readonly selectedItem = new SimpleObjectProperty<LexCompletion | null>(null);

    // The top Y coordinate of the header (if present, first item if not) of each group in curCompletions.  These coordinates
    // are relative to the pane.  Due to the pinning, it is possible
    // that the next group begins before the previous one ends.
    // These will change as scrolling happens
    private groupTopY: number[] = [];

    // This is the canonical scroll position.  Scroll ranges from 0 up to max(0, sum(group heights) - list display height),
    // where each group height is (number of items + (has header ? 1 : 0)) * ITEM_HEIGHT.
    // This scroll can be affected by keyboard movement, scroll events, or scroll bar use.
    private canonicalScrollPosition = 0;
    // Java: the region's height (its pref height, computePrefHeight; its border is drawn over the rows)
    private height = 0;

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

    // Java: the scroll bar's and scroll events' updateScroll(toY, animate)
    public updateScroll(toY: number): void
    {
        const maxScroll = this.getTotalHeight() - this.height;
        this.canonicalScrollPosition = Math.max(0, Math.min(toY, maxScroll));
        this.recalculateChildren();
    }

    public getScrollPosition(): number
    {
        return this.canonicalScrollPosition;
    }

    /** The height of all the rows, which the scroll bar scrolls through. */
    public getTotalHeight(): number
    {
        return this.curCompletionGroups.reduce((sum, _g, i) => sum + this.calcGroupHeight(i), 0);
    }

    /** Where each group's first row (its header, if it has one) is shown, from the list's top. */
    public getGroupTopY(): readonly number[]
    {
        return this.groupTopY;
    }

    protected calcDisplayRows(): number
    {
        let total = 0;
        for (const group of this.curCompletionGroups)
        {
            if (group.header !== null)
                total++;
            total += group.completions.length;
        }
        return total;
    }

    private calcGroupHeight(groupIndex: number): number
    {
        const group = this.curCompletionGroups[groupIndex]!;
        const rows = group.completions.length + (group.header !== null ? 1 : 0);
        return rows * LexCompletionList.ITEM_HEIGHT;
    }

    private calcMinGroupHeight(groupIndex: number): number
    {
        const group = this.curCompletionGroups[groupIndex]!;
        const rows = group.completions.length === 0 ? 0 : (Math.min(group.minCollapsed, group.completions.length) + (group.header !== null ? 1 : 0));
        return rows * LexCompletionList.ITEM_HEIGHT;
    }

    /** Java: computePrefHeight, the list's height (with its border) */
    public computePrefHeight(): number
    {
        return Math.min(this.calcDisplayRows() * LexCompletionList.ITEM_HEIGHT + 2 /* border */, 400.0);
    }

    // Java: the group positions part of recalculateChildren (the rest, making the rows, is the GUI's)
    private recalculateChildren(): void
    {
        const groups = this.curCompletionGroups;
        this.groupTopY = new Array<number>(groups.length);
        // We go up from bottom, presuming that the top group takes left-over space:

        const groupMinHeight = groups.map(g => LexCompletionList.ITEM_HEIGHT * ((g.header !== null ? 1 : 0) + Math.min(g.completions.length, g.minCollapsed)));

        let internalY = 0;
        for (let groupIndex = 0; groupIndex < groups.length; groupIndex++)
        {
            const internalGroupEnd = internalY + this.calcGroupHeight(groupIndex);
            const minHeightInclLater = groupMinHeight.slice(groupIndex).reduce((a, b) => a + b, 0);
            this.groupTopY[groupIndex] = Math.min(internalY - this.canonicalScrollPosition, this.height - minHeightInclLater);
            internalY = internalGroupEnd;
        }
    }

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

        // Java: the height listener, after the list is laid out at its new pref height
        this.height = this.computePrefHeight();
        // Need to update internal heights as select() will try to keep in view:
        this.recalculateChildren();
        // Keep same item selected, if still present:
        const sel = this.selectedItem.get();
        const target = sel === null ? null : this.completionIndexes.get(sel) ?? null;
        this.select(target);
        // TODO should we try to maintain scroll position -- but how to calculate this?
        this.updateScroll(0);
    }

    public select(target: Pair<number, number> | null): void
    {
        this.selectionIndex = target;
        this.selectedItem.set(target === null ? null : this.curCompletionGroups[target.getFirst()]!.completions[target.getSecond()]!);

        // Scroll to show item if one is selected:
        if (target !== null)
        {
            const ITEM_HEIGHT = LexCompletionList.ITEM_HEIGHT;
            // This is in terms of internal virtual height:
            let selectedTopY = ITEM_HEIGHT * (target.getSecond() + (this.curCompletionGroups[target.getFirst()]!.header !== null ? 1 : 0));
            for (let i = 0; i < target.getFirst(); i++)
                selectedTopY += this.calcGroupHeight(i);
            const selectedBottomY = selectedTopY + ITEM_HEIGHT;

            // Need to calculate the last visible pixel (in internal virtual height) before
            // the min height of the groups below it.  The last pixel if no groups are below is
            // canonicalScrollPosition + height.
            let viewableToBottomOfGroup = this.height;
            for (let i = target.getFirst() + 1; i < this.curCompletionGroups.length; i++)
                viewableToBottomOfGroup -= this.calcMinGroupHeight(i);
            const lastVisibleYInGroup = this.canonicalScrollPosition + viewableToBottomOfGroup;

            if (selectedBottomY > lastVisibleYInGroup)
            {
                this.updateScroll(selectedBottomY - viewableToBottomOfGroup);
            }
            else if (selectedTopY < this.canonicalScrollPosition)
            {
                this.updateScroll(selectedTopY);
            }
            else
            {
                this.recalculateChildren();
            }
        }
        else
        {
            this.recalculateChildren();
        }
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
