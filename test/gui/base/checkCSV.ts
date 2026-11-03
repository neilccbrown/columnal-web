// Port of test.gui.trait.CheckCSVTrait (tests-gui-base): exporting a table to CSV through its menu, and
// checking the file.
import { expect, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../../src/engine/types/data/datatype/DataTypeValue.js";
import type { VirtualGrid } from "../../../src/gui-logic/stf/gui/grid/VirtualGrid.js";
import type { GridTableDisplay } from "../../../src/gui/grid/GridTableDisplay.js";
import { triggerTableHeaderContextMenu } from "./clickOnTableHeader.js";

/**
 * Exports the table with its menu's "Export Data...", picking CSV (the first exporter), and checks the
 * file (here downloaded, where Java typed a file name into the save dialog) is the expected columns'.
 */
export async function exportToCSVAndCheck(virtualGrid: VirtualGrid, display: GridTableDisplay, prefix: string, expected: readonly (readonly [string, readonly string[]])[]): Promise<void>
{
    await triggerTableHeaderContextMenu(virtualGrid, display.getPosition());
    await userEvent.click(await vi.waitUntil(() => document.querySelector(".id-tableDisplay-menu-exportData")));
    const downloads: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement)
    {
        downloads.push(this.href);
    });
    try
    {
        // Pick CSV:
        await userEvent.click(await vi.waitUntil(() => document.querySelector(".exporter-list")?.closest("[role=dialog]")?.querySelector(".ok-button") ?? null));
        await vi.waitUntil(() => downloads.length === 1, { timeout: 5000 });
        const actualCSV = await (await fetch(downloads[0]!)).text();
        expect(actualCSV, prefix).toBe(toCSV(expected));
    }
    finally
    {
        click.mockRestore();
    }
}

export function toCSV(csvColumns: readonly (readonly [string, readonly string[]])[]): string
{
    const columnLengths = new Set(csvColumns.map(p => p[1].length));
    expect(columnLengths.size, "Column lengths differ (column lengths: " + [...columnLengths].join(", ") + ")").toBe(1);

    const length = [...columnLengths][0]!;

    let s = "";
    for (let i = 0; i < csvColumns.length; i++)
    {
        s += quoteCSV(csvColumns[i]![0]);
        if (i < csvColumns.length - 1)
            s += ",";
    }
    s += "\n";

    for (let row = 0; row < length; row++)
    {
        for (let i = 0; i < csvColumns.length; i++)
        {
            s += quoteCSV(csvColumns[i]![1][row]!);
            if (i < csvColumns.length - 1)
                s += ",";
        }
        s += "\n";
    }

    return s;
}

// (Java tripled the quotes, as its CSVExporter did: a Java bug, fixed in the exporter, which doubles them)
function quoteCSV(original: string): string
{
    return "\"" + original.replaceAll("\"", "\"\"") + "\"";
}

/** The column's values as text, but for the rows excluded. */
export function collapse(length: number, type: DataTypeValue, ...excluding: number[]): string[]
{
    const r: string[] = [];
    for (let i = 0; i < length; i++)
    {
        if (!excluding.includes(i))
            r.push(DataTypeUtility.valueToString(type.getCollapsed(i)));
    }
    return r;
}
