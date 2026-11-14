// In the engine: a Manual Edit's entries (Java: ManualEditEntriesDialog.Entry and getEntries), and how
// its dialog shows them (Java: makeCellContent's labels, worked out on a worker thread).
import type { ColumnId } from "../../engine/identifiers/id/ColumnId.js";
import type { ComparableEither } from "../../engine/utility-adt/utility/adt/ComparableEither.js";
import { DataTypeUtility } from "../../engine/types/data/datatype/DataTypeUtility.js";
import type { ManualEdit } from "../../engine/transformations/transformations/ManualEdit.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { Log } from "../../engine/utility/log/Log.js";
import type { ManualEditEntryInfo } from "./protocol.js";
import ComparableValue = DataTypeUtility.ComparableValue;

/** Java: ManualEditEntriesDialog.Entry. */
export interface ManualEditEntry
{
    readonly key: ComparableValue;
    readonly column: ColumnId;
    readonly value: ComparableEither<string, ComparableValue>;
}

/** Java: ManualEditEntriesDialog.getEntries: by column (in the replacements' order), then by key. */
export function manualEditEntries(manualEdit: ManualEdit): ManualEditEntry[]
{
    const r: ManualEditEntry[] = [];
    manualEdit.getReplacements().forEach((values, column) =>
    {
        for (const p of values.streamAll())
            r.push({ key: p.getFirst(), column, value: p.getSecond() });
    });
    return r;
}

/** Java: makeCellContent: the key, the column and the value, as text (or the error, if any). */
export function entryInfo(entry: ManualEditEntry): ManualEditEntryInfo
{
    try
    {
        const key = DataTypeUtility.valueToString(entry.key.getValue());
        const value = entry.value.eitherEx(err => err, v => DataTypeUtility.valueToString(v.getValue()));
        return { key, column: entry.column.getRaw(), value };
    }
    catch (e)
    {
        if (e instanceof InternalException)
            Log.log(e);
        else if (!(e instanceof UserException))
            throw e;
        return { error: "Error: " + (e.getLocalizedMessage() ?? "") };
    }
}
