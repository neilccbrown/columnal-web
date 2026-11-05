// The port of TestTypeEditorCompletion (tests-gui-type-editor): the completions in the type editor of a
// new column of a table (from IDS's add column arrow).  (Also ported headless, in
// test/gui-logic/tests-gui-type-editor.)
import { afterEach, describe, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import { ColumnUtility } from "../../../src/engine/data/data/ColumnUtility.js";
import { ImmediateDataSource } from "../../../src/engine/data/data/DataSources.js";
import { EditableRecordSet } from "../../../src/engine/data/data/EditableRecordSet.js";
import { Table } from "../../../src/engine/data/data/Table.js";
import { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { DataType, TagType } from "../../../src/engine/types/data/datatype/DataType.js";
import { TaggedTypeDefinition } from "../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../../../src/engine/types/data/datatype/TypeId.js";
import type { JellyType } from "../../../src/engine/types/jellytype/JellyTypes.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { c, checkCompletions } from "../base/editorCompletion.js";
import { settle } from "../base/editorDisplay.js";
import { push, write } from "../base/keyboard.js";
import { closeApp, renderApp, savedFile, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

async function loadTypeExpression(_typeExpressionSrc: string, ...taggedTypes: TaggedTypeDefinition[]): Promise<void>
{
    const content = savedFile(toLoad =>
    {
        for (const taggedTypeDefinition of taggedTypes)
        {
            toLoad.getTypeManager().registerTaggedType(taggedTypeDefinition.getTaggedTypeName().getRaw(), taggedTypeDefinition.getTypeArguments(), taggedTypeDefinition.getTags());
        }
        toLoad.record(
            new ImmediateDataSource(toLoad,
                new Table.InitialLoadDetails(new TableId("IDS"), null, new CellPosition(CellPosition.row(1), CellPosition.col(1)), null),
                new EditableRecordSet(
                    [rs => ColumnUtility.makeImmediateColumn(DataType.NUMBER, new ColumnId("My Number"), new Decimal(0)).apply(rs)],
                    () => 0)));
    });
    app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    // Start creating column
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".expand-arrow.expand-right"), { timeout: 5000 }));
    await vi.waitUntil(() => document.activeElement?.classList.contains("column-name-text-field") === true, { timeout: 5000 });
    await write("Col");
    await push("Tab");
    await settle();
}

describe("TestTypeEditorCompletion", () =>
{
    test("testCore", async () =>
    {
        await loadTypeExpression("");
        await checkCompletions(
            c("Number", 0, 0),
            c("Number{}", 0, 0),
            c("Text", 0, 0),
            c("Date", 0, 0),
            c("DateTime", 0, 0),
            c("DateYM", 0, 0)
        );
        await write("Dat");

        await checkCompletions(
            c("Number", 0, 0),
            c("Number{}", 0, 0),
            c("Text", 0, 0),
            c("Date", 0, 3),
            c("DateTime", 0, 3),
            c("DateYM", 0, 3)
        );
    });

    test("testBuiltInTagged", async () =>
    {
        await loadTypeExpression("",
            new TaggedTypeDefinition(new TypeId("Opsicle"), [], [new TagType<JellyType>("Single", null)]),
            new TaggedTypeDefinition(new TypeId("Either"), [new Pair(TaggedTypeDefinition.TypeVariableKind.TYPE, "a"), new Pair(TaggedTypeDefinition.TypeVariableKind.TYPE, "b")], [new TagType<JellyType>("Left", null)]));
        // Don't want to offer Void or Type as they are considered internal
        await checkCompletions(
            c("Optional()", 0, 0),
            c("Opsicle", 0, 0),
            c("Either()()", 0, 0),
            c("Void"),
            c("Type")
        );
        await write("Opst");

        await checkCompletions(
            c("Optional()", 0, 2),
            c("Opsicle", 0, 3),
            c("Either()()", 0, 0),
            c("Void"),
            c("Type")
        );
    });
});
