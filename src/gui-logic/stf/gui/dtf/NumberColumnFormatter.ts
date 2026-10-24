// Port of xyz.columnal.gui.dtf.NumberColumnFormatter (stf module): lays out the numbers shown in
// a column, aligned on the decimal point, shortened with an ellipsis to fit the column's width.
//
// PORT-NOTE: Java formats the visible cells of an EditorKitCache (VisibleDetails), which are
// DocumentTextFields; the GUI's cells implement NumberColumnFormatter.Cell instead.  Java measures
// the widths of digits and the dot with a JavaFX Text in the cell styles (DigitSizes); the GUI
// supplies these through NumberColumnFormatter.measureDigitSizes.  The large block of Java code
// that is commented out (an earlier version) is not copied.
import type { Decimal } from "../../../../engine/java/JavaBigDecimal.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { RecogniserDocument } from "./RecogniserDocument.js";

const ELLIPSIS = "…";//"⋯";

enum DotStatus
{
    NOT_PRESENT, INVISIBLE, VISIBLE,
}

class NumberDetails
{
    /** @internal */ public readonly textField: NumberColumnFormatter.Cell;
    /** @internal */ public readonly fullFracPart: string;
    /** @internal */ public readonly fullIntegerPart: string;
    /** @internal */ public displayFracPart: string;
    /** @internal */ public displayIntegerPart: string;
    /** @internal */ public displayDotState: DotStatus;

    public constructor(textField: NumberColumnFormatter.Cell, n: Decimal)
    {
        this.textField = textField;
        const intPart = Utility.getIntegerPart(n);
        // Numbers like -0.5 will have positive zero as their integer part,
        // so we must guard against it and turn it into negative zero:
        if (intPart.isZero() && n.isNegative() && !n.isZero())
        {
            this.fullIntegerPart = "-0";
        }
        else
            this.fullIntegerPart = Utility.numberToString(intPart);
        this.fullFracPart = Utility.getFracPartAsString(n, 0, -1);
        // TODO should these be taken from NumberEntry?
        this.displayIntegerPart = this.fullIntegerPart;
        this.displayFracPart = this.fullFracPart;
        this.displayDotState = DotStatus.VISIBLE;
    }

    public updateDisplay(): void
    {
        //Log.debug("Replacing: " + displayIntegerPart + "//" + displayFracPart);
        const editorKit = this.textField.getRecogniserDocument();
        if (editorKit !== null)
        {
            const displayIntegerPart = this.displayIntegerPart;
            const displayFracPart = this.displayFracPart;
            const displayDotState = this.displayDotState;
            editorKit.setUnfocusedDocument([
                    new Pair<ReadonlySet<string>, string>(new Set(["stf-number-int"]), displayIntegerPart),
                    new Pair<ReadonlySet<string>, string>(javaTrimIsEmpty(displayFracPart) ? new Set(["stf-number-dot", "stf-number-dot-invisible"]) : new Set(["stf-number-dot"]), displayFracPart !== "" ? "." : ""),
                    new Pair<ReadonlySet<string>, string>(new Set(["stf-number-frac"]), displayFracPart),
            ], n =>
            {
                // Clicking the left always stays left most:
                if (n === 0 || (n === 1 && displayIntegerPart.startsWith("-")))
                    return n;
                else
                {
                    const prevInt = displayIntegerPart.length;
                    const prevDot = displayDotState !== DotStatus.NOT_PRESENT ? 1 : 0;
                    if (n <= prevInt)
                        // Right-align the position:
                        return this.fullIntegerPart.length - (prevInt - n);
                    else
                        // Left-align the position:
                        return this.fullIntegerPart.length + (this.fullFracPart === "" ? 0 : 1) + (n - (prevInt + prevDot));
                }
            });

            this.textField.refreshDocument(this.textField.isFocused());
            this.textField.setIdealWidth(NumberColumnFormatter.fullSize(this.fullIntegerPart.length, this.fullFracPart.length));
        }
    }
}

// Java: s.trim().isEmpty()
function javaTrimIsEmpty(s: string): boolean
{
    for (let i = 0; i < s.length; i++)
    {
        if (s.charCodeAt(i) > 0x20)
            return false;
    }
    return true;
}

/**
 * One per column.
 */
// package-visible
export class NumberColumnFormatter
{
    private static SIZES: NumberColumnFormatter.DigitSizes | null = null;

    /**
     * Measures the widths of digits and the dot, as Java's DigitSizes does: the width of twenty "0"
     * characters in the style class "stf-number-int", and in "stf-number-frac", divided by 20; and the
     * width of twenty-two "." characters divided by 20 (Java doesn't apply the "stf-number-dot" style
     * before measuring them, so they are in the "stf-number-frac" style).  All in a parent with style
     * class "stf-cell-number".  Set by the GUI.
     */
    public static measureDigitSizes: () => NumberColumnFormatter.DigitSizes = () =>
    {
        throw new Error("NumberColumnFormatter.measureDigitSizes has not been set by the GUI");
    };

    private recentDetails: NumberDetails[] = [];

    /** Java: consume(EditorKitCache<Number>.VisibleDetails) */
    public consume(vis: NumberColumnFormatter.VisibleDetails): void
    {
        const visibleItems: NumberDetails[] = [];
        for (const visibleCell of vis.visibleCells)
        {
            visibleCell.setUnfocusedAlignment("RIGHT");
            const editorKit = visibleCell.getRecogniserDocument();
            if (editorKit !== null)
            {
                const value = editorKit.getLatestValue().either<Decimal | null>(_err => null, x => x);
                if (value !== null)
                {
                    visibleItems.push(new NumberDetails(visibleCell, value));
                }
            }
        }

        this.recentDetails = visibleItems;

        // Left length is number of digits to left of decimal place, right length is number of digits to right of decimal place
        let maxLeftLength = visibleItems.length === 0 ? 1 : Math.max(...visibleItems.map(d => d.fullIntegerPart.length));
        let maxRightLength = visibleItems.length === 0 ? 0 : Math.max(...visibleItems.map(d => d.fullFracPart.length));
        const pixelWidth = vis.width - 8; // Allow some padding

        // We truncate the right side if needed, to a minimum of minimumDP, at which point we truncate the left side
        // to what remains
        const minimumDP = Math.min(2, maxRightLength); //displayInfo == null ? 0 : displayInfo.getMinimumDP();
        while (NumberColumnFormatter.rightToLeft(maxRightLength, pixelWidth) < maxLeftLength && maxRightLength > minimumDP && maxRightLength > 1) // can be zero only if already zero
        {
            maxRightLength -= 1;
        }
        while (NumberColumnFormatter.rightToLeft(maxRightLength, pixelWidth) < maxLeftLength && maxLeftLength > 1)
        {
            maxLeftLength -= 1;
        }
        // Still not enough room for everything?  Just set it all to ellipsis if so:
        const onlyEllipsis = NumberColumnFormatter.rightToLeft(maxRightLength, pixelWidth) < maxLeftLength;

        for (const display of visibleItems)
        {
            if (onlyEllipsis)
            {
                display.displayIntegerPart = ELLIPSIS;
                display.displayFracPart = "";
            }
            else
            {
                display.displayIntegerPart = display.fullIntegerPart;
                display.displayFracPart = display.fullFracPart;

                while (display.displayFracPart.length < maxRightLength)
                    display.displayFracPart += " "; //displayInfo == null ? " " : displayInfo.getPaddingChar();

                if (display.displayFracPart.length > maxRightLength)
                {
                    display.displayFracPart = display.displayFracPart.substring(0, Math.max(0, maxRightLength - 1)) + ELLIPSIS;
                }
                if (display.displayIntegerPart.length > maxLeftLength)
                {
                    if (display.displayIntegerPart.startsWith("-"))
                        display.displayIntegerPart = "-" + ELLIPSIS + display.displayIntegerPart.substring(display.displayIntegerPart.length - maxLeftLength + 2);
                    else
                        display.displayIntegerPart = ELLIPSIS + display.displayIntegerPart.substring(display.displayIntegerPart.length - maxLeftLength + 1);
                }

                if (maxRightLength === 0)
                    display.displayDotState = DotStatus.NOT_PRESENT;
                else if (javaTrimIsEmpty(display.fullFracPart))
                    display.displayDotState = DotStatus.INVISIBLE;
                else
                    display.displayDotState = DotStatus.VISIBLE;

                display.updateDisplay();
            }
        }
    }

    /** @internal For tests: the integer part, dot status and fraction part of each number last laid out. */
    public _test_getRecentDetails(): readonly { integerPart: string, dot: string, fracPart: string }[]
    {
        return this.recentDetails.map(d => ({ integerPart: d.displayIntegerPart, dot: DotStatus[d.displayDotState], fracPart: d.displayFracPart }));
    }

    // Maps a number of digits on the right side of the decimal place to the amount
    // of digits which there is then room for on the left side of the decimal place:
    private static rightToLeft(right: number, totalWidth: number): number
    {
        if (NumberColumnFormatter.SIZES === null)
            NumberColumnFormatter.SIZES = NumberColumnFormatter.measureDigitSizes();

        let width = totalWidth - (right === 0 ? 0 : NumberColumnFormatter.SIZES.DOT_WIDTH);
        width -= right * NumberColumnFormatter.SIZES.RIGHT_DIGIT_WIDTH;
        return Math.floor(width / NumberColumnFormatter.SIZES.LEFT_DIGIT_WIDTH);
    }

    // Given number of digits to left of point, number to right, calculates required width
    /** @internal */
    public static fullSize(left: number, right: number): number
    {
        if (NumberColumnFormatter.SIZES === null)
            NumberColumnFormatter.SIZES = NumberColumnFormatter.measureDigitSizes();

        return 1.1 * left * NumberColumnFormatter.SIZES.LEFT_DIGIT_WIDTH + (right === 0 ? 0 : (NumberColumnFormatter.SIZES.DOT_WIDTH + NumberColumnFormatter.SIZES.RIGHT_DIGIT_WIDTH * right * 1.1));
    }

    /** @internal For tests: forget the measured sizes. */
    public static _test_resetSizes(): void
    {
        NumberColumnFormatter.SIZES = null;
    }
}

export namespace NumberColumnFormatter
{
    export class DigitSizes
    {
        public readonly LEFT_DIGIT_WIDTH: number;
        public readonly RIGHT_DIGIT_WIDTH: number;
        public readonly DOT_WIDTH: number;

        public constructor(leftDigitWidth: number, rightDigitWidth: number, dotWidth: number)
        {
            this.LEFT_DIGIT_WIDTH = leftDigitWidth;
            this.RIGHT_DIGIT_WIDTH = rightDigitWidth;
            this.DOT_WIDTH = dotWidth;
        }
    }

    /** The parts of Java's DocumentTextField that the formatter uses. */
    export interface Cell
    {
        // Java: setUnfocusedAlignment(TextAlignment)
        setUnfocusedAlignment(alignment: "LEFT" | "RIGHT"): void;
        // Java: getRecogniserDocument(Number.class), null unless the cell holds a number document
        getRecogniserDocument(): RecogniserDocument<Decimal> | null;
        refreshDocument(focused: boolean): void;
        setIdealWidth(width: number): void;
        isFocused(): boolean;
    }

    /** Java: EditorKitCache.VisibleDetails: the visible cells of the column, and its width. */
    export interface VisibleDetails
    {
        readonly visibleCells: readonly Cell[];
        readonly width: number;
    }
}
