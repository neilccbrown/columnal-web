// The port of TestExpressionEditorInvalid (tests-gui-expression-editor-further): an invalid expression
// entered into an editor, saved, and given to a new editor, shows as it was entered (ignoring spaces
// and round brackets).
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import type { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { SimpleObjectProperty } from "../../../src/engine/java/JavaFXBeans.js";
import ExpressionEditor from "../../../src/gui/lexeditor/ExpressionEditor.vue";
import type { TopLevelEditorApi } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import { checkProperty } from "../../support/quickcheck.js";
import { DummyManager } from "../../engine/tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";
import { settle } from "../base/editorDisplay.js";
import { enterAndDeleteSmartBrackets } from "../base/enterType.js";
import { GenInvalidExpressionSource } from "./GenInvalidExpressionSource.js";

// Java: @Ignore // TODO restore
test.skip("testLoadSaveInvalid", () => checkProperty([new GenInvalidExpressionSource()], async (invalid: string) =>
{
    const dummyManager = new DummyManager();
    const expressionEditorA = await makeExpressionEditor(dummyManager, null);
    await userEvent.click(document.querySelector(".top-level-editor .cm-content")!);
    await enterAndDeleteSmartBrackets(invalid);
    const savedInvalid = expressionEditorA.save(false);
    const expressionEditorB = await makeExpressionEditor(dummyManager, savedInvalid);
    expect(expressionEditorB._test_getRawText().replaceAll(/[ ()]/g, ""), savedInvalid.toString()).toBe(invalid.replaceAll(/[ ()]/g, ""));
}, { trials: 20 }), 120_000);

// (Java made each editor the window's only content)
async function makeExpressionEditor(dummyManager: DummyManager, initial: Expression | null): Promise<TopLevelEditorApi<Expression>>
{
    cleanup();
    const editor = ref<{ editor: () => TopLevelEditorApi<Expression> } | null>(null);
    render(defineComponent(() => () => h(ExpressionEditor, {
        ref: editor,
        originalContent: initial,
        columnLookup: new SimpleObjectProperty<Expression.ColumnLookup>(TFunctionUtil.dummyColumnLookup()),
        expectedType: null,
        typeManager: dummyManager.getTypeManager(),
        makeTypeState: () => TFunctionUtil.createTypeState(dummyManager.getTypeManager()),
        functionLookup: FunctionList.getFunctionLookup(dummyManager.getUnitManager()),
    })));
    await settle();
    return editor.value!.editor();
}
