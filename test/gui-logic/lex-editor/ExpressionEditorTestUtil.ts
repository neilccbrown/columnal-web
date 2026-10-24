// The setting of BaseTestExpressionEditorError (tests-gui-expression-editor-further): a table
// "Table1" with text columns S1-S3 and number columns ACC1-ACC3 (in m/s^2), and the editor for a
// new column "DestCol" of a Calculate from it.  The GUI test types each expression into that
// editor; here it is given to the expression lexer directly.
import { expect } from "vitest";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import type { EditableColumn } from "../../../src/engine/data/data/EditableColumn.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { MemoryNumericColumn } from "../../../src/engine/data/data/MemoryNumericColumn.js";
import { MemoryStringColumn } from "../../../src/engine/data/data/MemoryStringColumn.js";
import type { RecordSet } from "../../../src/engine/data/data/RecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal, ZERO } from "../../../src/engine/java/JavaBigDecimal.js";
import { SimpleObjectProperty } from "../../../src/engine/java/JavaFXBeans.js";
import { HashMap } from "../../../src/engine/java/HashMap.js";
import { Calculate } from "../../../src/engine/transformations/transformations/Calculate.js";
import { MultipleTableLookup } from "../../../src/engine/transformations/transformations/MultipleTableLookup.js";
import { NumberInfo } from "../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ExpressionLexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { ExpressionUtil } from "../../../src/engine/expressions/transformations/expression/ExpressionUtil.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { makeEditor, typeAndApplyFix, typeInto } from "./EditorHarness.js";
import { checkResultErrors, type ExpectedError } from "./EditorTestUtil.js";

// rows: BaseTestExpressionEditorError's table has one row, BaseTestQuickFix's none
export function makeTable1ExpressionLexer(rows: 0 | 1 = 1): ExpressionLexer
{
    const mgr = new DummyManager();
    const u = mgr.getUnitManager();
    const columns: ((rs: RecordSet) => EditableColumn)[] = [];
    for (let i = 1; i <= 3; i++)
    {
        columns.push(rs => new MemoryStringColumn(rs, new ColumnId("S" + i), rows === 0 ? [] : [Either.right("Hi " + i)], ""));
        columns.push(rs => new MemoryNumericColumn(rs, new ColumnId("ACC" + i), new NumberInfo(u.loadUse("m/s^2")), rows === 0 ? [] : [Either.right(new Decimal(i))], ZERO));
    }
    const table1 = mgr.record(new ImmediateDataSource(mgr, new Table.InitialLoadDetails(new TableId("Table1"), null, null, null), new EditableRecordSet(columns, () => rows)));
    const calc = mgr.record(new Calculate(mgr, new Table.InitialLoadDetails(new TableId("Table2"), null, null, null), table1.getId(), new HashMap<ColumnId, Expression>()));
    const columnLookup = new MultipleTableLookup(calc.getId(), mgr, table1.getId(), calc.makeEditor(new ColumnId("DestCol")));
    return new ExpressionLexer(new SimpleObjectProperty<Expression.ColumnLookup>(columnLookup), mgr.getTypeManager(), FunctionList.getFunctionLookup(mgr.getUnitManager()), () => Calculate.makeTypeState(mgr), null);
}

/**
 * The test's testError: types the expression into an editor for it, a character at a time, and
 * checks the errors.  As in the GUI test, if the expression starts with \u0000, the closing
 * brackets which the editor inserts after an opening one are kept (and overtyped); otherwise each is
 * deleted after it is inserted, and typed later.  With no errors expected, the GUI test checks
 * that no error is shown (errors are only shown away from the caret) and that the editor closes
 * on OK, which lexes the content without a caret; here that lexing must give no errors.
 */
export function testExpressionError(expression: string, ...errors: ExpectedError[]): void
{
    const { content, display } = makeEditor("", makeTable1ExpressionLexer());
    typeInto(display, expression);

    if (errors.length === 0)
    {
        const caretPos = content.getCaretPosition();
        expect(content.getErrors().filter(err => err.error.getLength() > 0 && !err.location.touches(caretPos)).map(err => err.error.toPlain()), "Errors shown").toEqual([]);
        // Clicking OK:
        content.forceSaveAsIfUnfocused();
        checkResultErrors(content.getLexerResult(), content.getText(), false);
    }
    else
    {
        checkResultErrors(content.getLexerResult(), content.getText(), true, ...errors);
    }
}



// BaseTestQuickFix.dotCssClassFor, without the dot
export function cssClassFor(expression: string): string
{
    const typeManager = DummyManager.make().getTypeManager();
    return ExpressionUtil.makeCssClass(TFunctionUtil.parseExpression(expression, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager())));
}

/**
 * BaseTestQuickFix.testFix: types the original expression into the editor for a new column of a
 * Calculate, clicks OK (so errors show), moves the caret onto fixFieldContent (empty for the end),
 * checks an error shows there, picks the one quick fix with the given CSS class (or the only one, if
 * fixCssClass is empty), applies it, and checks the expression saved for the column.
 * A fix which is an action (such as a dialog to define a unit) is only checked to be offered, and
 * to leave the expression as it was.
 */
export function testFix(original: string, fixFieldContent: string, fixCssClass: string, result: string): void
{
    const ed = makeEditor("", makeTable1ExpressionLexer(0));
    const applied = typeAndApplyFix(ed, original, fixFieldContent, fixCssClass);
    if (!applied)
    {
        // Applying an action needs the GUI (e.g. a dialog to define a unit)
        expect(original, "The fix is an action, which needs the GUI").toBe(result);
    }

    const typeManager = DummyManager.make().getTypeManager();
    const expected = TFunctionUtil.parseExpression(result, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
    const actual = ed.finish();
    expect(actual.equals(expected), "Got " + ed.content.getText() + ", i.e. " + actual.toStyledString().toPlain() + ", expected " + expected.toStyledString().toPlain()).toBe(true);
}

// BaseTestQuickFix.testSimpleFix
export function testSimpleFix(original: string, fixFieldContent: string, fixed: string): void
{
    testFix(original, fixFieldContent, cssClassFor(fixed), fixed);
}
