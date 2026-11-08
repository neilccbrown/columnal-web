// What the dialogs with an expression editor share: loading the expression the engine sent, and picking
// columns from the grid into it.
import { markRaw } from "vue";
import { BracketedStatus } from "../../engine/expressions/transformations/expression/BracketedStatus.js";
import { ErrorAndTypeRecorderStorer } from "../../engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { ExpressionUtil } from "../../engine/expressions/transformations/expression/ExpressionUtil.js";
import type { TypeState } from "../../engine/expressions/transformations/expression/TypeState.js";
import { ExpressionVersion } from "../../engine/parsers/grammar/Versions.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { Expression } from "../../engine/expressions/transformations/expression/Expressions.js";
import type { FunctionLookup } from "../../engine/expressions/transformations/expression/function/FunctionLookup.js";
import { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../engine/identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../engine/identifiers/id/TableId.js";
import type { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { TopLevelEditor } from "../../gui-logic/lex-editor/gui/lexeditor/TopLevelEditor.js";
import type { PickingMode } from "../grid/picking.js";
import type { TopLevelEditorApi } from "../lexeditor/TopLevelEditorApi.js";

/**
 * An expression, as the engine saved it (as in a file), for an editor; null if it can't be loaded.
 * (Java's had been checked, by its transformation, which resolved its names: saving it for the editor
 * uses them, so it is checked here too.)
 */
export function loadEditorExpression(expression: string | null, typeManager: TypeManager, functionLookup: FunctionLookup, columnLookup: Expression.ColumnLookup, typeState: TypeState): Expression | null
{
    if (expression === null)
        return null;
    let loaded: Expression;
    try
    {
        loaded = ExpressionUtil.parse(null, expression, ExpressionVersion.latest(), typeManager, functionLookup);
    }
    catch
    {
        return null;
    }
    try
    {
        loaded.checkExpression(columnLookup, typeState, new ErrorAndTypeRecorderStorer());
    }
    catch (e)
    {
        if (!(e instanceof UserException || e instanceof InternalException))
            throw e;
    }
    return loaded;
}

/** An expression from an editor, saved as in a file, for the engine. */
export function saveEditorExpression(expression: Expression): string
{
    return expression.save(Expression.SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
}

/**
 * Java: ExpressionEditor's ColumnPicker, piggy-backed by a dialog of one expression (EditExpressionDialog
 * and EditCheckExpressionDialog): while the editor is focused, a column clicked in the grid goes into
 * the expression, as the lookup refers to it.  (EditColumnExpressionDialog has its own, which can also
 * pick the column's name.)
 */
export function expressionPicking(editor: () => TopLevelEditorApi<Expression> | null, columnLookup: () => Expression.ColumnLookup, typeManager: TypeManager, functionLookup: FunctionLookup, dialogContent: () => HTMLElement | null): PickingMode
{
    return markRaw<PickingMode>({
        kind: "column",
        include: (table, column) => column !== null && editor()?.isFocused() === true && columnLookup().getPossibleColumnReferences(new TableId(table), new ColumnId(column)).length > 0,
        onPick: picked =>
        {
            const ed = editor();
            // If they recently clicked a completion, ignore this click:
            if (ed === null || ed.isMouseClickImmune() || picked.column === null)
                return;
            const reference = columnLookup().getPossibleColumnReferences(new TableId(picked.table), new ColumnId(picked.column))[0];
            if (reference !== undefined)
            {
                ed.replaceSelection(reference.getExpression().save(Expression.SaveDestination.toExpressionEditor(typeManager, columnLookup(), functionLookup), BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY));
                ed.focus(TopLevelEditor.Focus.RIGHT);
            }
        },
        target: () => dialogContent()?.closest(".light-dialog")?.getBoundingClientRect() ?? null,
        startPoint: null,
    });
}
