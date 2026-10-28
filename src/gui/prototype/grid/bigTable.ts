// Grid prototype (Phase 7, throwaway): a saved file with a large data table and a Calculate on it,
// for measuring the grid with many rows.
export function bigTableFile(rows: number): string
{
    const lines: string[] = [
        "DATA @BEGIN BIG",
        "BIG \"Big\"",
        "BIG FORMAT @BEGIN",
        "BIG @COLUMN Number @TYPE Number @DEFAULT 0",
        "BIG @COLUMN Text @TYPE Text @DEFAULT \"\"",
        "BIG @COLUMN Day @TYPE Date @DEFAULT 2000-01-01",
        "BIG @COLUMN Flag @TYPE Boolean @DEFAULT false",
        "BIG @END FORMAT",
        "BIG VALUES @BEGIN",
    ];
    const day0 = Date.UTC(2000, 0, 1);
    for (let i = 0; i < rows; i++)
    {
        const day = new Date(day0 + (i % 20000) * 86400000).toISOString().substring(0, 10);
        lines.push(`BIG   ${i * 7 % 1000003 / 100} , "Row ${i} text" , ${day} , ${i % 3 === 0}`);
    }
    lines.push(
        "BIG @END VALUES",
        "BIG DISPLAY @BEGIN",
        "BIG POSITION 1 1",
        "BIG SHOWCOLUMNS ALL",
        "BIG @END DISPLAY",
        "@END BIG DATA",
        "",
        "TRANSFORMATION @BEGIN BIGCALC",
        "BIGCALC \"Big calc\"",
        "BIGCALC calculate",
        "BIGCALC SOURCE \"Big\"",
        "BIGCALC @BEGIN",
        "BIGCALC CALCULATE \"Double\" @EXPRESSION column\\\\Number * 2",
        "BIGCALC @END",
        "BIGCALC DISPLAY @BEGIN",
        "BIGCALC POSITION 1 1",
        "BIGCALC SHOWCOLUMNS ALL",
        "BIGCALC @END DISPLAY",
        "@END BIGCALC TRANSFORMATION",
        "");
    return lines.join("\n");
}
