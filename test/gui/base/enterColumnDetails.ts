// Port of test.gui.trait.EnterColumnDetailsTrait (tests-gui-base): filling in the column dialog (name,
// type and default value), then clicking OK.
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { TypeExpression } from "../../../src/engine/expressions/transformations/expression/type/TypeExpression.js";
import type { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { textToType } from "../../gui-logic/stf/fixtures/textToType.js";
import { enterType } from "./enterType.js";
import { push, write } from "./keyboard.js";
import { sleep } from "./util.js";

/** Java: EditImmediateColumnDialog.ColumnDetails. */
export class ColumnDialogDetails
{
    public constructor(public readonly columnId: ColumnId, public readonly dataType: DataType, public readonly defaultValue: Value)
    {
    }
}

/** Call once the dialog is showing.  We will click the OK button before returning. */
export async function enterColumnDetails(columnDetails: ColumnDialogDetails, r: JavaRandom): Promise<void>
{
    // We should be focused on name initially with the whole field selected, or blank:
    expect(document.querySelector(".type-editor .error-underline"), "Should be no errors showing in type editor while unfocused").toBeNull();
    await write(columnDetails.columnId.getRaw());
    await push("Tab");
    await enterType(TypeExpression.fromDataType(columnDetails.dataType), r);
    await push("Escape");
    await push("Escape");
    const defValue = await vi.waitUntil(() => document.querySelector<HTMLElement>(".default-value"));
    expect(defValue.classList.contains("disabled")).toBe(false);
    // (The field's editable part)
    await userEvent.click(defValue.matches("textarea") ? defValue : defValue.querySelector("textarea")!);
    expect(defValue.contains(document.activeElement)).toBe(true);

    // We should already be in the default value (Java: enterStructuredValue, deleting all first):
    await userEvent.keyboard("{ControlOrMeta>}a{/ControlOrMeta}");
    await push("Delete");
    await write(textToType(columnDetails.dataType, columnDetails.defaultValue, r, true));
    await userEvent.click(document.querySelector(".ok-button")!);

    // If we can still see the dialog, there was a problem.  Cancel the dialog instead:
    await sleep(500);
    if (document.querySelector(".edit-column-content") !== null)
    {
        // (Java: "Error in dialog; cancelling", after a pause to see the problem)
        const error = document.querySelector(".error-label")?.textContent ?? "";
        await userEvent.click(document.querySelector(".cancel-button")!);
        expect.fail("Could not click OK in dialog without error: " + error);
    }
}
