// Lexers for the editor tests, with the test fixtures' managers.
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { SimpleObjectProperty } from "../../../src/engine/java/JavaFXBeans.js";
import type { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { ExpressionLexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/ExpressionLexer.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";

export function testTypeManager(): TypeManager
{
    return DummyManager.make().getTypeManager();
}

// An expression lexer with no columns or tables
export function testExpressionLexer(): ExpressionLexer
{
    const mgr = DummyManager.make();
    const typeManager = mgr.getTypeManager();
    return new ExpressionLexer(new SimpleObjectProperty<Expression.ColumnLookup>(TFunctionUtil.dummyColumnLookup()), typeManager, FunctionList.getFunctionLookup(mgr.getUnitManager()), () => TFunctionUtil.createTypeState(typeManager), null);
}
