// Port of test.gui.trait.CreateDataTableTrait (tests-gui-base): making a data table of given columns, by
// putting their values on the clipboard and pasting them into an empty cell, then naming it.
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { CellPosition } from "../../../src/engine/data/data/CellPosition.js";
import type { ColumnId } from "../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../src/engine/identifiers/id/TableId.js";
import { ClipboardUtils } from "../../../src/engine/importers/importers/ClipboardUtils.js";
import type { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { GetValue } from "../../../src/engine/types/data/datatype/DataTypeValue.js";
import type { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InvalidImmediateValueException } from "../../../src/engine/utility-error/error/InvalidImmediateValueException.js";
import { StyledString } from "../../../src/engine/utility-error/styled/StyledString.js";
import type { Value } from "../../../src/engine/utility/utility/Value.js";
import { RectangleBounds } from "../../../src/gui-logic/stf/gui/grid/RectangleBounds.js";
import { writeClipboard } from "../../../src/gui/clipboard.js";
import { TBasicUtil } from "../../engine/tests-basic/fixtures/data/TBasicUtil.js";
import { engineHost, type RenderedApp } from "../fixtures/app.js";
import { clickOnItemInBounds } from "./clickTableLocation.js";
import { push, write } from "./keyboard.js";
import { keyboardMoveTo } from "./scrollTo.js";
import { selectAllCurrentTextField } from "./textField.js";

export class ColumnDetails
{
    public constructor(public readonly name: ColumnId, public readonly dataType: DataType, public readonly data: readonly Either<string, Value>[])
    {
    }
}

export async function createDataTable(app: RenderedApp, targetPos: CellPosition, tableName: string, columns: readonly ColumnDetails[]): Promise<void>
{
    const virtualGrid = app.mainWindow()!.grid()!.grid;
    const mgr = engineHost(app).tableManager;
    await keyboardMoveTo(virtualGrid, targetPos);

    // (Java: a commented-out TODO to make the table through the new-table dialog instead)

    const copied = await new Promise<boolean>(resolve =>
    {
        try
        {
            ClipboardUtils.copyValuesToClipboard(mgr.getUnitManager(), mgr.getTypeManager(), columns.map(c => new Pair(c.name, c.dataType.fromCollapsed(GetValue.of(i => c.data[i]!.either(invalid =>
            {
                throw new InvalidImmediateValueException(StyledString.s("cdtt_err"), invalid);
            }, valid => valid))))), () => new ClipboardUtils.RowRange(0, columns[0]!.data.length - 1), content => void writeClipboard(Object.fromEntries(content)), resolve);
        }
        catch (_e)
        {
            resolve(false);
        }
    });
    expect(copied).toBe(true);
    // (Java's write was synchronous; here the page's write is waited for)
    await vi.waitUntil(async () => (await navigator.clipboard.read()).some(item => item.types.includes("web " + ClipboardUtils.DATA_FORMAT)), { timeout: 5000 });

    // Now all columns should be in place, select table and hit paste:
    const before = new Set(mgr.getAllTables().map(t => t.getId().getRaw()));
    await keyboardMoveTo(virtualGrid, targetPos);
    await userEvent.keyboard("{ControlOrMeta>}v{/ControlOrMeta}");
    // (Java slept 3 seconds)
    await vi.waitUntil(() => mgr.getAllTables().some(t => !before.has(t.getId().getRaw())) && document.querySelector(".table-name-text-field") !== null, { timeout: 10_000 });
    // Enter table name:
    await clickOnItemInBounds(".table-display-table-title .table-name-text-field", virtualGrid, new RectangleBounds(targetPos, targetPos));
    await selectAllCurrentTextField();
    await write(tableName);
    await push("Enter");
    // Give time for rename:
    await vi.waitUntil(() => mgr.getSingleTableOrNull(new TableId(tableName)) !== null, { timeout: 10_000 });

    // Double check the values via direct access:
    const actualColumns = mgr.getSingleTableOrThrow(new TableId(tableName)).getData().getColumns();
    for (let i = 0; i < columns.length; i++)
        TBasicUtil.assertValueListEitherEqual("Column " + columns[i]!.name.getRaw(), columns[i]!.data, TBasicUtil.getAllCollapsedData(actualColumns[i]!.getType(), columns[i]!.data.length));
}
