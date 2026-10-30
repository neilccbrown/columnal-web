// A saved file with one data table of the given size, at column 1, row 1: column C<n> has the number
// row * 1000 + n in each row.
export function wideTableFile(rows: number, columns: number): string
{
    const lines = ["COLUMNAL", "VERSION 3", "", "DATA @BEGIN TAB", "TAB \"Wide\"", "TAB FORMAT @BEGIN"];
    for (let c = 0; c < columns; c++)
        lines.push(`TAB @COLUMN C${c} @TYPE Number @DEFAULT 0`);
    lines.push("TAB @END FORMAT", "TAB VALUES @BEGIN");
    for (let r = 0; r < rows; r++)
        lines.push("TAB   " + Array.from({ length: columns }, (_, c) => String(r * 1000 + c)).join(" , "));
    lines.push("TAB @END VALUES", "TAB DISPLAY @BEGIN", "TAB POSITION 1 1", "TAB SHOWCOLUMNS ALL", "TAB @END DISPLAY", "@END TAB DATA", "");
    return lines.join("\n");
}

/** A saved file with one data table, Table1, at column 1, row 1, of one number column C with these values. */
export function numberColumnFile(values: readonly string[]): string
{
    return ["COLUMNAL", "VERSION 3", "", "DATA @BEGIN TAB", "TAB \"Table1\"", "TAB FORMAT @BEGIN",
        "TAB @COLUMN C @TYPE Number @DEFAULT 0", "TAB @END FORMAT", "TAB VALUES @BEGIN",
        ...values.map(v => "TAB   " + v),
        "TAB @END VALUES", "TAB DISPLAY @BEGIN", "TAB POSITION 1 1", "TAB SHOWCOLUMNS ALL", "TAB @END DISPLAY", "@END TAB DATA", ""].join("\n");
}
