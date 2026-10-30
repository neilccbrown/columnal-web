// Port of TestDocumentTextField (tests-gui-dtf): typing, moving the caret with the keys, clicking and
// dragging to place the caret and select, deleting, and scrolling sideways to keep the caret in view.
//
// PORT-NOTE: Java's caret moved one UTF-16 unit at a time, and the test clicked at code point
// boundaries; a textarea keeps its caret out of surrogate pairs and, when clicked, between graphemes,
// so the caret moves by code points here, and clicks go to grapheme boundaries.  Java removed
// right-to-left characters (bidi class R) from the strings; a browser also reorders Arabic (AL), so the
// right-to-left blocks are removed.
import { describe, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { DisplayDocument } from "../../../src/gui-logic/stf/gui/dtf/DisplayDocument.js";
import DocumentTextField from "../../../src/gui/components/DocumentTextField.vue";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenString } from "../../engine/tests-basic/fixtures/gen/GenString.js";
import { checkProperty } from "../../support/quickcheck.js";

type Field = InstanceType<typeof DocumentTextField>;

class TestDocument extends DisplayDocument
{
    public override setAndSave(): void
    {
    }
}

async function initialiseField(initialText: string, width = 300): Promise<Field>
{
    cleanup();
    const field = ref<Field | null>(null);
    render(defineComponent(() => () => h("div", { style: { padding: "12px", width: width + "px" } }, [
        h(DocumentTextField, { ref: field, document: new TestDocument(initialText) }),
    ])));
    const element = field.value!.element()!;
    expect(element.getBoundingClientRect().width).toBeGreaterThanOrEqual(Math.min(width, 100));
    expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(10);
    return field.value!;
}

function removeNonPrintableAndRtoL(s: string): string
{
    const rtl = (c: number): boolean => (c >= 0x0590 && c <= 0x08FF) || (c >= 0xFB1D && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF)
        || (c >= 0x10800 && c <= 0x10FFF) || (c >= 0x1E800 && c <= 0x1EFFF);
    return [...s].filter(c => !/[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}]/u.test(c) && !rtl(c.codePointAt(0)!)).join("");
}

// At most 100 code units, as Java's s.substring(0, s.length() % 100), without splitting a pair:
function shorten(s: string): string
{
    if (s.length <= 100)
        return s;
    const cut = s.length % 100;
    return s.substring(0, /[\uDC00-\uDFFF]/.test(s[cut] ?? "") ? cut - 1 : cut);
}

// The positions a click can put the caret at (Java: calcEditPositions, by code point).  PORT-NOTE: also
// leaving out those at the same place as the one before (after a zero-width character, such as a
// variation selector), which a click can't tell apart:
function calcEditPositions(s: string, field: Field): number[]
{
    const positions = [...new Intl.Segmenter().segment(s)].map(seg => seg.index);
    positions.push(s.length);
    return positions.filter((p, i) => i === 0 || Math.abs(field._test_getClickPosFor(p).x - field._test_getClickPosFor(positions[i - 1]!).x) >= 1);
}

// The caret position a code point to the left or right:
const left = (s: string, pos: number): number => pos === 0 ? 0 : pos - (/[\uDC00-\uDFFF]/.test(s[pos - 1]!) && pos >= 2 ? 2 : 1);
const right = (s: string, pos: number): number => pos === s.length ? pos : pos + (/[\uD800-\uDBFF]/.test(s[pos]!) && pos + 1 < s.length ? 2 : 1);

const getText = (field: Field): string => field._test_getGraphicalText();

async function clickAt(field: Field, p: { x: number, y: number }): Promise<void>
{
    const element = field.element()!;
    const r = element.getBoundingClientRect();
    await userEvent.click(element, { position: { x: p.x - r.left, y: p.y - r.top } });
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe("TestDocumentTextField", () =>
{
    test("testBasic", () => checkProperty([new GenString(), new GenRandom()], async (generated: string, r: JavaRandom) =>
    {
        let s = shorten(removeNonPrintableAndRtoL(generated));
        const field = await initialiseField(s);

        const unfocused = getText(field);
        // While unfocused, could be truncated for efficiency:
        expect(s.startsWith(unfocused)).toBe(true);

        await userEvent.click(field.element()!);
        expect(field.isFocused()).toBe(true);
        // Once focused, should have complete text:
        expect(getText(field)).toEqual(s);

        await userEvent.keyboard("{Home}");
        expect(field.getCaretPosition()).toBe(0);
        const codePoints = [...s];
        const moveRightTo = s.length === 0 ? 0 : r.nextInt(Math.min(codePoints.length, 25));
        let pos = 0;
        for (let i = 0; i < moveRightTo; i++)
        {
            await userEvent.keyboard("{ArrowRight}");
            pos = right(s, pos);
            expect(field.getCaretPosition()).toBe(pos);
        }

        await userEvent.keyboard("a z");
        expect(getText(field)).toEqual(s.substring(0, pos) + "a z" + s.substring(pos));
        for (let i = 0; i < 2; i++)
            await userEvent.keyboard("{Backspace}");
        expect(getText(field)).toEqual(s.substring(0, pos) + "a" + s.substring(pos));
        await userEvent.keyboard("{ArrowLeft}{Delete}");
        expect(getText(field)).toEqual(s);

        let editPositions = calcEditPositions(s, field);
        for (let i = 0; i < 5; i++)
        {
            const target = s.length === 0 ? 0 : editPositions[r.nextInt(editPositions.length)]!;
            await clickAt(field, field._test_getClickPosFor(target));
            expect(field.getCaretPosition()).toBe(target);
            // Prevent it counting as multi click:
            await sleep(600);
        }

        for (let i = 0; i < 5; i++)
        {
            editPositions = calcEditPositions(s, field);
            const aPos = s.length === 0 ? 0 : editPositions[r.nextInt(editPositions.length)]!;
            const bPos = s.length === 0 ? 0 : editPositions[r.nextInt(editPositions.length)]!;
            const element = field.element()!;
            const box = element.getBoundingClientRect();
            const aClick = field._test_getClickPosFor(aPos);
            const bClick = field._test_getClickPosFor(bPos);
            await userEvent.dragAndDrop(element, element, {
                sourcePosition: { x: aClick.x - box.left, y: aClick.y - box.top },
                targetPosition: { x: bClick.x - box.left, y: bClick.y - box.top },
            });
            expect(field.getAnchorPosition(), `Selecting ${aPos} to ${bPos}`).toBe(aPos);
            expect(field.getCaretPosition(), `Selecting ${aPos} to ${bPos}`).toBe(bPos);
            // Prevent it counting as multi click:
            await sleep(600);
            await userEvent.keyboard("{Home}");
            let p = 0;
            while (p < aPos)
            {
                await userEvent.keyboard("{ArrowRight}");
                p = right(s, p);
            }
            await userEvent.keyboard("{Shift>}");
            while (p !== bPos)
            {
                await userEvent.keyboard(bPos < aPos ? "{ArrowLeft}" : "{ArrowRight}");
                p = bPos < aPos ? left(s, p) : right(s, p);
            }
            await userEvent.keyboard("{/Shift}");
            expect(field.getAnchorPosition(), `Selecting ${aPos} to ${bPos}`).toBe(aPos);
            expect(field.getCaretPosition(), `Selecting ${aPos} to ${bPos}`).toBe(bPos);

            if (aPos === 0 && bPos === 0)
                continue;
            let start = Math.min(aPos, bPos);
            let end = Math.max(aPos, bPos);
            const msg = `Deleting ${start} to ${end} from {{${s}}}`;
            switch (r.nextInt(4))
            {
                case 0:
                    if (start !== end || start > 0)
                    {
                        await userEvent.keyboard("{Backspace}");
                        if (start === end)
                            start = left(s, start);
                        s = s.substring(0, start) + s.substring(end);
                        expect(getText(field), msg).toEqual(s);
                        expect(field.getCaretPosition(), msg).toBe(start);
                        expect(field.getAnchorPosition(), msg).toBe(start);
                    }
                    break;
                case 1:
                    if (start !== end || end < s.length)
                    {
                        await userEvent.keyboard("{Delete}");
                        if (start === end)
                            end = right(s, end);
                        s = s.substring(0, start) + s.substring(end);
                        expect(getText(field), msg).toEqual(s);
                        expect(field.getCaretPosition(), msg).toBe(start);
                        expect(field.getAnchorPosition(), msg).toBe(start);
                    }
                    break;
            }
        }
    }, { trials: 5, shrink: false }), 120_000);

    test("testDelete1", async () =>
    {
        const field = await initialiseField("");
        await userEvent.click(field.element()!);
        await userEvent.keyboard("13abcd");
        await userEvent.keyboard("{Home}{ArrowRight}{ArrowRight}");
        await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}");
        await userEvent.keyboard("{Backspace}");
        expect(getText(field)).toEqual("13");
    });

    test("testMove", () => checkProperty([new GenString(), new GenRandom()], async (generated: string, r: JavaRandom) =>
    {
        const s = shorten(removeNonPrintableAndRtoL(generated));
        const field = await initialiseField(s);
        await userEvent.click(field.element()!);
        await userEvent.keyboard("{Home}");
        let caret = 0;
        let anchor = 0;
        for (let i = 0; i < 20; i++)
        {
            const withShift = r.nextBoolean();
            let message: string;
            let expectedCaret: number;
            if (withShift)
                await userEvent.keyboard("{Shift>}");
            switch (r.nextInt(4))
            {
                case 0:
                    message = `Pushing left from ${caret} / ${s.length}`;
                    await userEvent.keyboard("{ArrowLeft}");
                    expectedCaret = left(s, caret);
                    break;
                case 1:
                    message = `Pushing right from ${caret} / ${s.length}`;
                    await userEvent.keyboard("{ArrowRight}");
                    expectedCaret = right(s, caret);
                    break;
                case 2:
                    message = `Pushing home from ${caret} / ${s.length}`;
                    await userEvent.keyboard("{Home}");
                    expectedCaret = 0;
                    break;
                default:
                    message = `Pushing end from ${caret} / ${s.length}`;
                    await userEvent.keyboard("{End}");
                    expectedCaret = s.length;
                    break;
            }
            if (withShift)
                await userEvent.keyboard("{/Shift}");
            expect(field.getCaretPosition(), message).toBe(expectedCaret);
            expect(field.getAnchorPosition(), message).toBe(withShift ? anchor : expectedCaret);
            caret = expectedCaret;
            if (!withShift)
                anchor = caret;
        }
    }, { trials: 5 }), 60_000);

    test("testHorizScroll", () => checkProperty([new GenString()], async (generated: string) =>
    {
        let s = removeNonPrintableAndRtoL(generated);
        if (s.length === 0)
            return; // Assume.assumeFalse(s.isEmpty())
        while (s.length < 50)
            s += s;
        const field = await initialiseField(s, 100);
        const element = field.element()!;
        expect(element.getBoundingClientRect().width).toBeLessThanOrEqual(110);

        await userEvent.click(element);
        await userEvent.keyboard("{Home}");
        const fieldBounds = element.getBoundingClientRect();
        const allPositions: number[] = [];
        const checkCaretInField = (): void =>
        {
            const caret = field._test_getClickPosFor(field.getCaretPosition());
            allPositions.push(Math.round(caret.x));
            // (Java: the caret's bounds intersect the field's; the caret is a line stroked half a pixel either
            // side of its position.  At the end of the text, the textarea's scroll range, a whole number of
            // pixels, can leave it a fraction of a pixel past the edge.)
            expect(caret.x + 0.5, `Field: ${fieldBounds.left}-${fieldBounds.right} caret: ${caret.x}`).toBeGreaterThan(fieldBounds.left);
            expect(caret.x - 0.5, `Field: ${fieldBounds.left}-${fieldBounds.right} caret: ${caret.x}`).toBeLessThan(fieldBounds.right);
        };
        for (let i = 0; i < 50; i++)
        {
            await userEvent.keyboard("{ArrowRight}");
            checkCaretInField();
        }
        for (let i = 0; i < 40; i++)
        {
            await userEvent.keyboard("{ArrowLeft}");
            checkCaretInField();
        }
        expect(new Set(allPositions).size).toBeGreaterThan(10);
    }, { trials: 3 }), 120_000);
});
