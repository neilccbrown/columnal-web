// Checks EnterTypeTrait's port (test/gui/base/enterType.ts) with the type editor: a generated type,
// typed in (as TestBlankMainWindow.propAddColumnToEntryTable does into a new column's type editor),
// is the type the editor saves.
import { expect, test } from "vitest";
import { cleanup, render } from "vitest-browser-vue";
import { defineComponent, h, ref } from "vue";
import { TypeExpression } from "../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import type { TopLevelEditorApi } from "../../../src/gui/lexeditor/TopLevelEditorApi.js";
import TypeEditor from "../../../src/gui/lexeditor/TypeEditor.vue";
import { GenDataTypeMaker } from "../../engine/tests-functions/fixtures/gen/type/GenDataTypeMaker.js";
import { checkProperty } from "../../support/quickcheck.js";
import { enterType } from "../base/enterType.js";

test("enterType types the type", () => checkProperty([new GenDataTypeMaker(undefined, true)], async (dataTypeMaker: GenDataTypeMaker.DataTypeMaker) =>
{
    const typeManager = dataTypeMaker.getTypeManager();
    const dataType = dataTypeMaker.makeType().getDataType();
    cleanup();
    const typeEditor = ref<{ editor(): TopLevelEditorApi<TypeExpression> } | null>(null);
    render(defineComponent(() => () => h("div", { style: { padding: "150px 20px 20px" } }, [
        h(TypeEditor, { ref: typeEditor, typeManager, originalContent: null, requireConcreteType: true, emptyAllowed: false }),
    ])));
    const editor = typeEditor.value!.editor();
    editor.focus(0);
    await enterType(TypeExpression.fromDataType(dataType), new JavaRandom(1n));
    const saved = editor.save(true);
    expect(editor.hasErrors(), editor._test_getRawText()).toBe(false);
    expect(saved.toDataType(typeManager)?.equals(dataType), editor._test_getRawText() + " vs " + dataType.toString()).toBe(true);
}, { trials: 20 }));
