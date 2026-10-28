// Grid prototype (Phase 7, throwaway): a cell's text as shown, from the engine's value.  Used on
// the main thread (ProtoTableDisplay) and in the engine worker (engineWorker.ts).
import type { Column } from "../../../engine/data/data/Column.js";
import { DataTypeUtility } from "../../../engine/types/data/datatype/DataTypeUtility.js";

export interface CellContent
{
    readonly text: string;
    readonly kind: "number" | "text" | "other" | "error" | "loading";
}

export function fetchCell(column: Column, row: number): CellContent
{
    try
    {
        const value = column.getType().getCollapsed(row);
        if (typeof value === "string")
            return { text: value, kind: "text" };
        const text = DataTypeUtility.valueToString(value);
        return { text, kind: /^-?[0-9]/.test(text) && !text.includes(" ") && !text.includes("-", 1) ? "number" : "other" };
    }
    catch (e)
    {
        return { text: e instanceof Error ? e.message : String(e), kind: "error" };
    }
}
