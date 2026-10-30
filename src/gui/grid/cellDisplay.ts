// How a column's cells are shown when not being edited (Java: EditorKitCache's documents, which its
// DocumentTextFields show unfocused, and NumberColumnFormatter, which lays out a number column's
// visible cells).  An editable cell's document is a RecogniserDocument, else a ReadOnlyDocument; one
// whose value couldn't be worked out shows the error (Java: ReadOnlyDocument(err, true)).
//
// PORT-NOTE: the engine (in the worker) gives each cell's text, and for an invalid value where its
// recogniser finds the error, so the main thread needs no types to show cells.  For number columns,
// the NumberRecogniser (which needs no types) makes the RecogniserDocuments that the formatter uses.
import type { Decimal } from "../../engine/java/JavaBigDecimal.js";
import type { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { NumberColumnFormatter } from "../../gui-logic/stf/gui/dtf/NumberColumnFormatter.js";
import { ReadOnlyDocument } from "../../gui-logic/stf/gui/dtf/ReadOnlyDocument.js";
import { RecogniserDocument } from "../../gui-logic/stf/gui/dtf/RecogniserDocument.js";
import { NumberRecogniser } from "../../gui-logic/stf/gui/dtf/recognisers/NumberRecogniser.js";
import { shallowRef } from "vue";
import "../styles/cells.css";
import type { CellContent } from "../engine/protocol.js";

export interface CellDisplay
{
    // The text, in parts with their style classes:
    readonly spans: readonly { readonly classes: readonly string[], readonly text: string }[];
    // Java: DocumentTextField's has-error pseudo-class (Document.hasError)
    readonly hasError: boolean;
    // Java: setUnfocusedAlignment (number columns are right-aligned)
    readonly alignRight: boolean;
    // Java: Document.mapCaretPos, from a position in the text shown to one in the cell's text (they
    // differ when NumberColumnFormatter has shortened a number):
    readonly mapCaretPos: (pos: number) => number;
}

const identity = (pos: number): number => pos;

function fromSpans(spans: readonly Pair<ReadonlySet<string>, string>[], hasError: boolean, alignRight: boolean): CellDisplay
{
    return { spans: spans.map(p => ({ classes: [...p.getFirst()], text: p.getSecond() })), hasError, alignRight, mapCaretPos: identity };
}

// Java: RecogniserDocument.makeStyledSpans, with the error position the engine found
function recognisedSpans(text: string, errorPosition: number | null): CellDisplay["spans"]
{
    if (errorPosition === null || errorPosition >= text.length)
        return [{ classes: [], text }];
    return [
        { classes: [], text: text.substring(0, errorPosition) },
        { classes: ["input-error"], text: text.substring(errorPosition, errorPosition + 1) },
        { classes: [], text: text.substring(errorPosition + 1) },
    ];
}

/** A cell as NumberColumnFormatter sees it (Java: a DocumentTextField). */
class FormatterCell implements NumberColumnFormatter.Cell
{
    public readonly document: RecogniserDocument<Decimal> | null;

    public constructor(document: RecogniserDocument<Decimal> | null)
    {
        this.document = document;
    }

    public setUnfocusedAlignment(): void
    {
        // (All number cells are right-aligned)
    }

    public getRecogniserDocument(): RecogniserDocument<Decimal> | null
    {
        return this.document;
    }

    public refreshDocument(): void
    {
    }

    public setIdealWidth(): void
    {
    }

    public isFocused(): boolean
    {
        return false;
    }
}

/**
 * The displays of the cells of one column that are on the page (null where the content hasn't arrived:
 * Java showed nothing while loading).  width is the column's width, which the formatter fits numbers to.
 */
export function columnDisplays(contents: readonly (CellContent | null)[], editable: boolean, isNumber: boolean, width: number): (CellDisplay | null)[]
{
    if (!isNumber)
    {
        return contents.map(content =>
        {
            if (content === null)
                return null;
            if (content.kind === "error")
                return fromSpans(new ReadOnlyDocument(content.text, true).getStyledSpans(false), true, false);
            if (!editable)
                return fromSpans(new ReadOnlyDocument(content.text).getStyledSpans(false), false, false);
            const errorPosition = content.kind === "invalid" ? content.errorPosition : null;
            return { spans: recognisedSpans(content.text, errorPosition), hasError: errorPosition !== null, alignRight: false, mapCaretPos: identity };
        });
    }
    // Java: the cells' documents, and the column's NumberColumnFormatter over the visible ones
    const documents = contents.map(content =>
    {
        if (content === null)
            return null;
        if (content.kind === "error")
            return new ReadOnlyDocument(content.text, true);
        if (!editable)
            return new ReadOnlyDocument(content.text);
        return new RecogniserDocument<Decimal>(content.text, "Number", new NumberRecogniser(), null, () => {}, () => {}, null);
    });
    new NumberColumnFormatter().consume({
        visibleCells: documents.flatMap(d => d === null ? [] : [new FormatterCell(d instanceof RecogniserDocument ? d : null)]),
        width,
    });
    return documents.map(d => d === null ? null : { ...fromSpans(d.getStyledSpans(false), d.hasError(), true), mapCaretPos: (pos: number) => d.mapCaretPos(pos) });
}

/**
 * Java's NumberColumnFormatter.DigitSizes: the widths of the digits and the dot, measured in the number
 * cell styles (twenty "0"s in stf-number-int, and in stf-number-frac, and twenty-two "."s, each divided
 * by twenty).  PORT-NOTE: Java's code measures the dots without applying the stf-number-dot style (so
 * in stf-number-frac's), but its tests, which passed, need the dot's own width; this measures that.
 * The fonts must have loaded first (see waitForNumberFonts).
 */
function measureDigitSizes(): NumberColumnFormatter.DigitSizes
{
    const root = document.createElement("div");
    root.className = "stf-cell-number";
    root.style.cssText = "position: absolute; visibility: hidden; white-space: pre;";
    const measure = (className: string, text: string): number =>
    {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        root.appendChild(span);
        return span.getBoundingClientRect().width;
    };
    document.body.appendChild(root);
    try
    {
        return new NumberColumnFormatter.DigitSizes(
            measure("stf-number-int", "00000000000000000000") / 20.0,
            measure("stf-number-frac", "00000000000000000000") / 20.0,
            measure("stf-number-dot", "......................") / 20.0);
    }
    finally
    {
        root.remove();
    }
}
NumberColumnFormatter.measureDigitSizes = measureDigitSizes;

let fontsLoading: Promise<void> | null = null;
// True once the number cells' fonts have loaded (see waitForNumberFonts):
export const numberFontsReady = shallowRef(false);

/** Loads the number cells' fonts, so that measureDigitSizes measures them; sets numberFontsReady. */
export function waitForNumberFonts(): Promise<void>
{
    fontsLoading ??= Promise.all([
        document.fonts.load("16px 'Noto Mono'", "0123456789"),
        document.fonts.load("13.6px 'Noto Mono'", "0123456789"),
        document.fonts.load("13.6px 'Noto Sans'", "."),
    ]).then(() => { numberFontsReady.value = true; });
    return fontsLoading;
}
