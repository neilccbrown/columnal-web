// Tests of the cell entry logic ported from the GUI module stf (src/gui-logic/stf/gui/dtf): the
// recognisers, NumberColumnFormatter and the documents.  Derived from the GUI tests that use them:
// TestCellReadWrite (typing values, as EnterStructuredValueTrait does), TestNumberColumnDisplay
// (how numbers are shown, and where a click puts the caret) and TestDocumentTextField.
import { afterEach, describe, expect, test } from "vitest";
import type { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { ParseProgress } from "../../../src/engine/utility/utility/ParseProgress.js";
import { Utility } from "../../../src/engine/utility/utility/Utility.js";
import { Platform } from "../../../src/engine/java/Platform.js";
import { javaTrim } from "../../../src/engine/java/JavaString.js";
import { Workers } from "../../../src/engine/utility/utility/Workers.js";
import { Document } from "../../../src/gui-logic/stf/gui/dtf/Document.js";
import { NumberColumnFormatter } from "../../../src/gui-logic/stf/gui/dtf/NumberColumnFormatter.js";
import { ReadOnlyDocument } from "../../../src/gui-logic/stf/gui/dtf/ReadOnlyDocument.js";
import { RecogniserDocument } from "../../../src/gui-logic/stf/gui/dtf/RecogniserDocument.js";
import { NumberRecogniser } from "../../../src/gui-logic/stf/gui/dtf/recognisers/NumberRecogniser.js";
import { TableDisplayUtility } from "../../../src/gui-logic/stf/gui/dtf/TableDisplayUtility.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { assertEquals } from "../../support/junit.js";
import { checkProperty } from "../../support/quickcheck.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenTypeAndValueGen } from "../../engine/tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";
import { textToType } from "./fixtures/textToType.js";

describe("recognisers", () =>
{
    test("typed values are recognised", async () =>
    {
        await checkProperty([new GenTypeAndValueGen(), new GenRandom()], (typeAndValueGen: GenTypeAndValueGen.TypeAndValueGen, r: JavaRandom) =>
        {
            const type = typeAndValueGen.getType();
            for (let i = 0; i < 5; i++)
            {
                const value = typeAndValueGen.makeValue();
                const text = textToType(type, value, r, true);
                const result = TableDisplayUtility.recogniser(type, true).recogniser.process(ParseProgress.fromStart(text), false).flatMap(s => s.requireEnd());
                result.either_(err => { throw new Error("Could not recognise " + text + " as " + type.toString() + ": " + err.error.toPlain() + " at " + err.errorPosition); }, succ =>
                {
                    assertEquals("Value from " + text, 0, Utility.compareValues(value, succ.value));
                    // The text the cell then shows is the value as saved (except for top-level text, which loses its quotes):
                    if (!DataType.TEXT.equals(type))
                        assertEquals("Replacement for " + text, DataTypeUtility.valueToString(value), succ.immediateReplacementText);
                });
            }
        }, { trials: 200 });
    });

    test("errors", () =>
    {
        const process = (type: DataType, text: string): string =>
            TableDisplayUtility.recogniser(type, true).recogniser.process(ParseProgress.fromStart(text), false).flatMap(s => s.requireEnd())
                .either(err => err.error.toPlain() + " @" + err.errorPosition, s => "OK " + s.immediateReplacementText);
        expect(process(DataType.NUMBER, "12.")).toBe("Expected digits after decimal point @3");
        expect(process(DataType.NUMBER, "abc")).toBe("Expected digits to start a number @0");
        expect(process(DataType.NUMBER, " +007.50 ")).toBe("OK 7.5");
        expect(process(DataType.NUMBER, "1 2")).toBe("Unexpected additional content: 2 @2");
        expect(process(DataType.BOOLEAN, "TRUE")).toBe("OK true");
        expect(process(DataType.BOOLEAN, "yes")).toBe("Expected true or false @0");
        expect(process(DataType.TEXT, "plain")).toBe("OK \"plain\"");
        expect(process(DataType.TEXT, "\"open")).toBe("Could not find closing \" for text @4");
        expect(process(DataType.array(DataType.NUMBER), "[1, 2,3]")).toBe("OK [1, 2, 3]");
        expect(process(DataType.array(DataType.NUMBER), "[1, 2")).toBe("Expected ']' to end list @5");
        expect(process(DataType.array(DataType.NUMBER), "[1, x]")).toBe("Expected digits to start a number @4");
        expect(process(DataType.record(new Map([["b", DataType.NUMBER], ["a", DataType.BOOLEAN]])), "(b: 2, a: true)")).toBe("OK (a: true, b: 2)");
        expect(process(DataType.record(new Map([["b", DataType.NUMBER], ["a", DataType.BOOLEAN]])), "(b: 2, c: true)")).toBe("Unknown field name: \"c\" @6");
    });
});

describe("NumberColumnFormatter", () =>
{
    // Digit widths consistent with the layouts that TestNumberColumnDisplay expects (which depend
    // on the font) in a column of the default width, 100:
    NumberColumnFormatter.measureDigitSizes = () => new NumberColumnFormatter.DigitSizes(9.6, 8, 4);
    NumberColumnFormatter._test_resetSizes();

    class Cell implements NumberColumnFormatter.Cell
    {
        public readonly doc: RecogniserDocument<Decimal>;
        public focused = false;

        public constructor(text: string)
        {
            this.doc = new RecogniserDocument<Decimal>(text, "Number", new NumberRecogniser(), null, () => {}, () => {}, null);
        }

        public setUnfocusedAlignment(): void {}
        public getRecogniserDocument(): RecogniserDocument<Decimal> { return this.doc; }
        public refreshDocument(): void {}
        public setIdealWidth(): void {}
        public isFocused(): boolean { return this.focused; }

        // Java's _test_getGraphicalText: the text shown
        public getText(): string
        {
            return this.doc.getStyledSpans(this.focused).map(p => p.getSecond()).join("");
        }
    }

    // TestNumberColumnDisplay.testNumbers: the numbers as shown, and where clicking on each puts the caret:
    function testNumbers(actualValues: readonly string[], expectedGUI: readonly string[]): void
    {
        const cells = actualValues.map(v => new Cell(v));
        new NumberColumnFormatter().consume({ visibleCells: cells, width: 100 });
        expect(cells.map(c => c.getText())).toEqual(expectedGUI);

        for (let i = 0; i < cells.length; i++)
        {
            const cell = cells[i]!;
            const gui = expectedGUI[i]!;
            const actual = actualValues[i]!;
            // When focused, the full number is shown:
            cell.focused = true;
            expect(cell.getText()).toBe(actual);
            cell.focused = false;

            // Clicking on the unfocused text at a character position (n) puts the caret at mapCaretPos(n):
            const guiMinusEllipsis = javaTrim(gui.replaceAll("…", "").replaceAll("-", "").replaceAll(". ", ""));
            const nonEllipsisPos = actual.indexOf(guiMinusEllipsis);
            expect(nonEllipsisPos).not.toBe(-1);
            const startsWithMinus = actual.startsWith("-");
            const ellipsisAtStart = gui.startsWith("…") || gui.startsWith("-…");
            const targets: [string, number, number][] = [
                ["FAR_LEFT", 0, 0],
                ["FAR_LEFT_AFTER_MINUS", startsWithMinus ? 1 : 0, startsWithMinus ? 1 : 0],
                ["INSIDE_LEFT", startsWithMinus ? 2 : 1, nonEllipsisPos + (ellipsisAtStart ? 0 : 1)],
                ["MIDDLE", Math.trunc(javaTrim(gui).length / 2), Math.trunc(javaTrim(gui).length / 2) + nonEllipsisPos + (ellipsisAtStart ? -1 : 0) + (startsWithMinus ? -1 : 0)],
                ["INSIDE_RIGHT", javaTrim(gui).length - (javaTrim(gui).endsWith(".") ? 2 : 1), nonEllipsisPos + guiMinusEllipsis.length + (gui.endsWith("…") ? 0 : -1)],
                ["FAR_RIGHT", javaTrim(gui).length, nonEllipsisPos + guiMinusEllipsis.length + (gui.endsWith("…") ? 1 : 0)],
            ];
            for (const [target, n, afterIndex] of targets)
                expect([target, gui, cell.doc.mapCaretPos(n)]).toEqual([target, gui, afterIndex]);
        }
    }

    test("testUnaltered", () => testNumbers(["0.1", "1.1", "2.1"], ["0.1", "1.1", "2.1"]));
    test("testNegative", () => testNumbers(["0.1", "-0.1", "2"], ["0.1", "-0.1", "2. "]));
    test("testAllTruncated", () => testNumbers(["0.112233445566778899", "1.112233445566778899", "2.112233445566778899"], ["0.11223344…", "1.11223344…", "2.11223344…"]));
    test("testAllTruncatedNeg", () => testNumbers(["-0.112233445566778899", "1.112233445566778899", "-2.112233445566778899"], ["-0.1122334…", "1.1122334…", "-2.1122334…"]));
    test("testSomeTruncated", () => testNumbers(["0.112233445566778899", "1.112233445", "2.11223344", "3.11223344"], ["0.11223344…", "1.112233445", "2.11223344 ", "3.11223344 "]));
    test("testSomeTruncatedNeg", () => testNumbers(["-0.112233445566778899", "1.112233445", "-2.11223344", "3.112233"], ["-0.1122334…", "1.1122334…", "-2.11223344", "3.112233  "]));
    test("testAllAbbreviated", () => testNumbers(["1234567890", "2234567890", "3234567890"], ["…34567890", "…34567890", "…34567890"]));
    test("testAllAbbreviatedNeg", () => testNumbers(["1234567890", "-2234567890", "3234567890"], ["…34567890", "-…4567890", "…34567890"]));
    test("testSomeAbbreviated", () => testNumbers(["1234567890", "234567890", "34567890"], ["…34567890", "234567890", "34567890"]));
    test("testSomeAbbreviatedNeg", () => testNumbers(["-1234567890", "234567890", "34567890"], ["-…4567890", "234567890", "34567890"]));
    test("testMixedUnaltered", () => testNumbers(["123.456", "2", "0.3456"], ["123.456 ", "2.    ", "0.3456"]));
    test("testBothEnds", () => testNumbers(["1234567890.112233445566778899", "2.3", "3.45", "4.567", "1234567890"], ["…567890.1…", "2.3 ", "3.45", "4.5…", "…567890.  "]));
    test("testBothEndsNeg", () => testNumbers(["-1234567890.112233445566778899", "2.3", "3.45", "-4.567", "1234567890"], ["-…67890.1…", "2.3 ", "3.45", "-4.5…", "…567890.  "]));
});

describe("documents", () =>
{
    afterEach(() =>
    {
        Platform._test_runPending();
        Workers._test_yield();
    });

    test("tracked positions move with edits", () =>
    {
        const doc = new RecogniserDocument<Decimal>("12345", "Number", new NumberRecogniser(), null, () => {}, () => {}, null);
        const back = doc.trackPosition(2, Document.TrackedPosition.Bias.BACKWARD, null);
        const forward = doc.trackPosition(2, Document.TrackedPosition.Bias.FORWARD, null);
        const after = doc.trackPosition(4, Document.TrackedPosition.Bias.FORWARD, null);
        doc.replaceText(1, 3, "xyz");
        expect([back.getPosition(), forward.getPosition(), after.getPosition()]).toEqual([1, 4, 5]);
    });

    test("recognising and saving on losing focus", () =>
    {
        const saved: [string, Decimal | null][] = [];
        const doc = new RecogniserDocument<Decimal>("1", "Number", new NumberRecogniser(), null, (text, v) => saved.push([text, v]), () => {}, null);
        doc.focusChanged(true);
        doc.replaceText(0, 1, "007.50");
        doc.focusChanged(false);
        // The text is replaced by the value as it is shown, and saved:
        expect(doc.getText()).toBe("7.5");
        expect(saved.map(s => [s[0], s[1]?.toString()])).toEqual([["7.5", "7.5"]]);
        expect(doc.hasError()).toBe(false);
        // An error is saved as text, and marked:
        doc.focusChanged(true);
        doc.replaceText(0, 3, "7.x");
        doc.focusChanged(false);
        expect(doc.hasError()).toBe(true);
        expect(saved[1]).toEqual(["7.x", null]);
        expect(doc.getStyledSpans(false).map(p => [[...p.getFirst()], p.getSecond()])).toEqual([[[], "7."], [["input-error"], "x"], [[], ""]]);
        // No change, so no save:
        doc.focusChanged(true);
        doc.focusChanged(false);
        expect(saved.length).toBe(2);
        expect(doc.getUndo()).toBe("7.x");
    });

    test("not editable on that row", () =>
    {
        const defocused: string[] = [];
        let alerted = "";
        const previous = RecogniserDocument.showErrorAlert;
        RecogniserDocument.showErrorAlert = (message, afterClose) => { alerted = message; afterClose(); };
        try
        {
            const doc = new RecogniserDocument<Decimal>("1", "Number", new NumberRecogniser(), () => false, () => {}, k => defocused.push(k), null);
            doc.focusChanged(true);
            doc.replaceText(0, 1, "2");
            Workers._test_yield();
            Platform._test_runPending();
            expect(doc.getText()).toBe("1");
            expect(defocused).toEqual(["ESCAPE", "ESCAPE"]);
            expect(alerted).toBe("Cannot edit value on a row with an error in the identifier column.");
        }
        finally
        {
            RecogniserDocument.showErrorAlert = previous;
        }
    });

    test("read-only document", () =>
    {
        const doc = new ReadOnlyDocument("Error: no", true);
        doc.replaceText(0, 2, "x");
        expect([doc.getText(), doc.getLength(), doc.hasError(), doc.isEditable()]).toEqual(["Error: no", 9, true, false]);
    });
});
