// The expression editor (docs/gui-spec/expression-editor.md): over the GUI's copy of the engine's
// column lookup, its fixes which are actions, the documentation windows, the completion list's
// groups, and what Phase 9 left of the lex editor (clicks just after choosing a completion, and the
// information popup's middle click).
/// <reference types="@vitest/browser-playwright" />
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-vue";
import { defineComponent, h, ref, shallowRef } from "vue";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { SimpleObjectProperty } from "../../../src/engine/java/JavaFXBeans.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { columnLookupInfo } from "../../../src/gui/engine/columnLookupInfo.js";
import DocWindowHost from "../../../src/gui/lexeditor/DocWindowHost.vue";
import ExpressionEditor from "../../../src/gui/lexeditor/ExpressionEditor.vue";
import type { TopLevelEditorApi } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { ColumnLookupCopy } from "../../../src/gui/project/columnLookupCopy.js";
import { sleep } from "../base/util.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";

interface Mounted
{
    readonly editor: TopLevelEditorApi<Expression>;
    readonly root: HTMLElement;
    readonly mgr: DummyManager;
    // How many times the editor said its fixes changed the declared types
    readonly typesChanged: () => number;
    // The column and expression given to a fix which moves them (after closing the "dialog")
    readonly moved: Pair<ColumnId | null, Expression>[];
    // Removes the editor (not the documentation windows' host)
    readonly hide: () => Promise<void>;
}

// Table1 (S1 text, N1 number in m), and Table2, a Calculate from it which recalculates N1 and adds D;
// the editor is for Table2's new column DestCol
async function mount(): Promise<Mounted>
{
    cleanup();
    const mgr = new DummyManager();
    const functions = FunctionList.getFunctionLookup(mgr.getUnitManager());
    const columns: ((rs: RecordSet) => EditableColumn)[] = [
        rs => new MemoryStringColumn(rs, new ColumnId("S1"), [Either.right("Hi")], ""),
        rs => new MemoryNumericColumn(rs, new ColumnId("N1"), new NumberInfo(mgr.getUnitManager().loadUse("m")), [Either.right(new Decimal(1))], ZERO),
    ];
    mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("Table1"), null, null, null), new EditableRecordSet(columns, () => 1)));
    const calcColumns = new HashMap<ColumnId, Expression>();
    calcColumns.set(new ColumnId("N1"), TFunctionUtil.parseExpression("N1 * 2", mgr.getTypeManager(), functions));
    calcColumns.set(new ColumnId("D"), TFunctionUtil.parseExpression("S1", mgr.getTypeManager(), functions));
    mgr.record(new Calculate(mgr, new Table.InitialLoadDetails(new TableId("Table2"), null, null, null), new TableId("Table1"), calcColumns));

    const moved: Pair<ColumnId | null, Expression>[] = [];
    // (Through JSON, as the engine sends it)
    const info = JSON.parse(JSON.stringify(columnLookupInfo(mgr, "Table2", "Table1"))) as ReturnType<typeof columnLookupInfo>;
    const lookup = new ColumnLookupCopy(info, mgr.getTypeManager(), {
        getCurrentlyEditingColumn: () => new ColumnId("DestCol"),
        moveExpressionToNewCalculation: () => p => moved.push(p),
    });
    const editor = ref<{ editor: () => TopLevelEditorApi<Expression> } | null>(null);
    const shown = shallowRef(true);
    let typesChanged = 0;
    render(defineComponent(() => () => h("div", { style: { padding: "150px 20px 20px" } }, [
        shown.value ? h(ExpressionEditor, {
            ref: editor,
            originalContent: null,
            columnLookup: new SimpleObjectProperty<Expression.ColumnLookup>(lookup),
            expectedType: null,
            typeManager: mgr.getTypeManager(),
            makeTypeState: () => Calculate.makeTypeState(mgr),
            functionLookup: functions,
            forceCloseDialog: () => new Pair<ColumnId | null, Expression>(new ColumnId("DestCol"), editor.value!.editor().save(false)),
            onTypesChanged: () => typesChanged++,
        }) : null,
        h(DocWindowHost),
    ])));
    await settle();
    return {
        editor: editor.value!.editor(),
        root: document.querySelector<HTMLElement>(".expression-editor")!,
        mgr,
        typesChanged: () => typesChanged,
        moved,
        hide: async () =>
        {
            shown.value = false;
            await settle();
        },
    };
}

async function settle(): Promise<void>
{
    await new Promise(r => requestAnimationFrame(r));
    await sleep(0);
}

async function focus(root: HTMLElement): Promise<void>
{
    await userEvent.click(root.querySelector(".cm-content")!);
    await settle();
}

async function keys(text: string): Promise<void>
{
    await userEvent.keyboard(text);
    await settle();
}

const popup = (): HTMLElement | null => document.querySelector<HTMLElement>(".expression-info-popup");
const popupText = (): string => popup()?.querySelector(".expression-info-error")?.textContent ?? "";
const fixRow = (text: string): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>(".quick-fix-row")].find(r => r.textContent.includes(text));
const completionTexts = (): string[] => [...document.querySelectorAll(".lex-completion:not(.lex-completion-header) .lex-completion-text-flow")].map(e => e.textContent);

describe("ExpressionEditor", () =>
{
    test("its size, and it checks against the copy of the engine's lookup: completions and type errors", async () =>
    {
        const { editor, root } = await mount();
        const box = root.getBoundingClientRect();
        expect(box.width).toBe(450);
        expect(box.height).toBeGreaterThanOrEqual(130);
        await focus(root);
        await keys("S");
        expect(completionTexts()).toContain("S1");
        // Table2's own column D isn't available (it's not in the source table):
        await keys("{Backspace}D");
        expect(completionTexts()).not.toContain("D");
        await keys("{Backspace}S1+1");
        // The type error (text plus a number) shows once the editor is left:
        (document.activeElement as HTMLElement).blur();
        await settle();
        expect(editor.hasErrors()).toBe(true);
        expect(root.querySelector(".error-underline")).not.toBeNull();
    });

    test("a reference to a column the table recalculates has a note", async () =>
    {
        const { root } = await mount();
        await focus(root);
        await keys("N1");
        await vi.waitUntil(() => popupText().includes("re-calculated"));
        expect(popupText()).toContain("Note: column N1 is re-calculated in this table, but this reference will use the value from the source table.");
    });

    test("a fix which is an action: moving the expression to a new calculation closes the dialog and gives it the expression", async () =>
    {
        const { root, moved } = await mount();
        await focus(root);
        // D is Table2's, not its source's: an unknown column, with the fix (a plain D would be an
        // unknown variable, which has none)
        await keys("column\\\\D+1{Home}");
        await keys("{ArrowRight}");
        const row = await vi.waitUntil(() => fixRow("Make a new calculation that can use this table's D"));
        await userEvent.click(row);
        await settle();
        expect(moved.map(p => [p.getFirst()?.getRaw(), p.getSecond().toString()])).toHaveLength(1);
        expect(moved[0]!.getFirst()?.getRaw()).toBe("DestCol");
        expect(popup()).toBeNull();
    });

    test("a fix which declares a unit: the editor rechecks, and says the types changed", async () =>
    {
        const { editor, root, mgr, typesChanged } = await mount();
        await focus(root);
        await keys("1{{zzz}{Home}");
        await keys("{ArrowRight}{ArrowRight}{ArrowRight}");
        const row = await vi.waitUntil(() => fixRow("Create unit \"zzz\""));
        await userEvent.click(row);
        await settle();
        expect(mgr.getUnitManager().getAllDeclared().some(u => u.getName() === "zzz")).toBe(true);
        expect(editor.hasErrors()).toBe(false);
        expect(typesChanged()).toBe(1);
    });

    test("a guide fix opens a documentation window; its examples insert; it closes with the editor", async () =>
    {
        const { editor, root, hide } = await mount();
        await focus(root);
        // Comparing metres to seconds: a units error, whose fix shows the units guide
        await keys("1{{m}=1{{s}");
        // (The error is the whole expression, so it shows once the editor has been left)
        (document.activeElement as HTMLElement).blur();
        await focus(root);
        const row = await vi.waitUntil(() => fixRow("Show units guide"));
        await userEvent.click(row);
        const docWindow = await vi.waitUntil(() => document.querySelector<HTMLElement>(".doc-window"));
        expect(docWindow.getAttribute("aria-label")).toBe("Units");
        // (Java's showed where the system put it; here centred)
        const box = docWindow.getBoundingClientRect();
        expect(Math.abs(box.left + box.width / 2 - window.innerWidth / 2)).toBeLessThanOrEqual(1);
        const example = await vi.waitUntil(() => docWindow.querySelector<HTMLElement>(".insertable-expression"));
        await focus(root);
        await keys("{End}");
        const before = editor._test_getRawText();
        await userEvent.click(example);
        await settle();
        // (At the caret; the editor's content has no spaces around operators)
        expect(editor._test_getRawText().replaceAll(" ", "")).toBe((before + example.getAttribute("data-insert")!).replaceAll(" ", ""));
        await hide();
        await vi.waitUntil(() => document.querySelector(".doc-window") === null);
    });

    test("choosing a guide completion opens the guide in a documentation window", async () =>
    {
        const { root } = await mount();
        await focus(root);
        await keys("units");
        const guide = await vi.waitUntil(() => [...document.querySelectorAll<HTMLElement>(".lex-completion")].find(e => e.textContent.includes("≈ units")));
        // (Clicking a selected completion chooses it)
        await userEvent.click(guide);
        if (document.querySelector(".doc-window") === null)
            await userEvent.click(guide);
        const docWindow = await vi.waitUntil(() => document.querySelector<HTMLElement>(".doc-window"));
        expect(docWindow.textContent).toContain("Units");
    });

    test("the completion list: each group's first rows stay in view as the list scrolls, and the selection is kept in view", async () =>
    {
        const { root } = await mount();
        await focus(root);
        const list = await vi.waitUntil(() => document.querySelector<HTMLElement>(".lex-completion-list"));
        const listBox = (): DOMRect => list.getBoundingClientRect();
        expect(listBox().height).toBe(400);
        const headers = (): HTMLElement[] => [...list.querySelectorAll<HTMLElement>(".lex-completion-header")];
        const inView = (e: HTMLElement): boolean => e.getBoundingClientRect().top >= listBox().top && e.getBoundingClientRect().bottom <= listBox().bottom;
        const help = (): HTMLElement => headers().find(e => e.textContent === "Help")!;
        expect(inView(help())).toBe(true);
        // The group before Help is cut off by it, with a fade:
        expect(list.querySelector(".fade-overlay")).not.toBeNull();
        // Scrolling moves the rows, but Help stays:
        const firstText = completionTexts()[0];
        list.scrollTop = 300;
        list.dispatchEvent(new Event("scroll"));
        await settle();
        expect(completionTexts()[0]).not.toBe(firstText);
        expect(inView(help())).toBe(true);
        // Moving the selection down a long way keeps it in view:
        list.scrollTop = 0;
        list.dispatchEvent(new Event("scroll"));
        await keys("{ArrowDown}".repeat(30));
        const selected = list.querySelector<HTMLElement>(".lex-completion.selected")!;
        expect(inView(selected)).toBe(true);
        expect(list.scrollTop).toBeGreaterThan(0);
    });

    test("clicks just after choosing a completion by clicking are ignored for 400 ms", async () =>
    {
        const { editor, root } = await mount();
        await focus(root);
        await keys("S");
        const s1 = await vi.waitUntil(() => [...document.querySelectorAll<HTMLElement>(".lex-completion")].find(e => e.textContent.includes("S1")));
        // (Clicking a selected completion chooses it)
        await userEvent.click(s1);
        if (editor._test_getRawText() !== "S1")
            await userEvent.click(s1);
        expect(editor._test_getRawText()).toBe("S1");
        expect(editor.isMouseClickImmune()).toBe(true);
        const content = editor._test_getContent();
        expect(content.getCaretPosition()).toBe(2);
        const left = root.querySelector(".cm-line")!.getBoundingClientRect().left;
        await userEvent.click(root.querySelector(".cm-content")!, { position: { x: 3, y: 10 } });
        expect(content.getCaretPosition()).toBe(2);
        await sleep(450);
        await userEvent.click(root.querySelector(".cm-content")!, { position: { x: 3, y: 10 } });
        expect(left).toBeGreaterThan(0);
        expect(content.getCaretPosition()).toBe(0);
    });

    test("a middle click on the information popup hides it until the caret moves", async () =>
    {
        const { root } = await mount();
        await focus(root);
        await keys("N1");
        const p = await vi.waitUntil(() => popup());
        p.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 1 }));
        await settle();
        expect(popup()).toBeNull();
        await keys("{ArrowLeft}");
        await vi.waitUntil(() => popup() !== null);
    });
});
