// Port of xyz.columnal.utility.gui.Clickable (utility-gui module): a style for part of a
// StyledString that can be clicked.
//
// PORT-NOTE: Java styles a JavaFX Text: it adds the style classes, calls onClick when the text is
// clicked, calls setHovering after the mouse has been over it for 300ms (and when it leaves or
// clicks), and shows a tooltip from tooltipKey.  Here applyTo adds the style classes, and the GUI,
// when it shows text with this style, does the rest: it calls onClick and setHovering, and shows
// getTooltipKey's text as a tooltip.  Mouse buttons are named as in JavaFX ("PRIMARY", ...), and
// points are screen coordinates.
import type { LocalizableKey } from "../../../../engine/anns/Annotations.js";
import type { StyleTarget } from "../../../../engine/utility-error/styled/StyledString.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";

export abstract class Clickable extends StyledString.Style<Clickable>
{
    private readonly tooltipKey: LocalizableKey | null;
    private readonly extraStyleClasses: readonly string[];

    // Java has two constructors: () (with tooltip "click.to.change") and (tooltipKey, String... styleClasses)
    public constructor(tooltipKey: LocalizableKey | null = "click.to.change", ...styleClasses: string[])
    {
        super(Clickable);
        this.tooltipKey = tooltipKey;
        this.extraStyleClasses = styleClasses;
    }

    protected abstract onClick(mouseButton: string, screenPoint: { x: number, y: number }): void;

    public _test_onClick(mouseButton: string, screenPoint: { x: number, y: number }): void
    {
        this.onClick(mouseButton, screenPoint);
    }

    /** Called by the GUI (see the PORT-NOTE above). */
    public click(mouseButton: string, screenPoint: { x: number, y: number }): void
    {
        this.onClick(mouseButton, screenPoint);
    }

    public setHovering(_hovering: boolean, _screenPos: { x: number, y: number }): void
    {
    }

    /** TS-only: the key of the tooltip's text, or null for none. */
    public getTooltipKey(): LocalizableKey | null
    {
        return this.tooltipKey;
    }

    public override applyTo(target: StyleTarget): void
    {
        target.classes.add("styled-text-clickable");
        for (const c of this.extraStyleClasses)
            target.classes.add(c);
    }

    public override combine(_withStyle: Clickable): Clickable
    {
        // Cannot combine, so make arbitrary choice:
        return this;
    }

    protected override equalsStyle(_item: Clickable): boolean
    {
        return false;
    }
}
