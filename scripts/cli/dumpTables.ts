// The contents of every table in a TableManager, as text: each table's length, and each column's
// type and values (or the error in getting them).  Used by the command-line tool (columnal-cli.ts)
// and the transformations golden test, and written the same way by the Java harnesses
// (scripts/golden/java/TransformationsHarness.java and CliHarness.java) to compare with the original.
import type { Column } from "../../src/engine/data/data/Column.js";
import type { TableManager } from "../../src/engine/data/data/TableManager.js";
import { javaCompare } from "../../src/engine/java/JavaObject.js";
import { RTransformation } from "../../src/engine/transformations/transformations/RTransformation.js";
import { DataTypeUtility } from "../../src/engine/types/data/datatype/DataTypeUtility.js";

// Java: "!" + the exception's class's simple name + ": " + its message
export function describeError(e: unknown): string
{
    if (!(e instanceof Error))
        throw e;
    return "!" + e.name + ": " + e.message;
}

/** The contents of every table, showing at most maxRows rows of each column. */
export function dumpTables(mgr: TableManager, maxRows: number): string
{
    let out = "";
    const line = (s: string): void => { out += s + "\n"; };
    // (Sorted, as Java's order is an identity hash order)
    for (const table of [...mgr.getAllTables()].sort((a, b) => javaCompare(a.getId(), b.getId())))
    {
        line("TABLE " + table.getId().getRaw());
        if (table instanceof RTransformation)
        {
            line("(R not run)");
            continue;
        }
        let columns: readonly Column[];
        let length: number;
        try
        {
            columns = table.getData().getColumns();
            length = table.getData().getLength();
        }
        catch (e)
        {
            line(describeError(e));
            continue;
        }
        line("LENGTH " + length);
        for (const column of columns)
        {
            let type: string;
            try
            {
                type = column.getType().getType().toString();
            }
            catch (e)
            {
                line("COLUMN " + column.getName().getRaw() + " " + describeError(e));
                continue;
            }
            line("COLUMN " + column.getName().getRaw() + " : " + type);
            for (let row = 0; row < Math.min(length, maxRows); row++)
            {
                try
                {
                    line("  " + row + ": " + DataTypeUtility.valueToString(column.getType().getCollapsed(row)));
                }
                catch (e)
                {
                    line("  " + row + ": " + describeError(e));
                }
            }
        }
    }
    return out;
}
