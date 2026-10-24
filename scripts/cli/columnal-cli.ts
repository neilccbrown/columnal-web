// A command-line tool that runs the engine without the GUI: loads a saved Columnal file,
// recomputes every table, and writes the results.
//
//   npm run cli -- [--max-rows N] <file.rec> <output-dir>
//
// Writes to the output directory:
//   saved.rec              the file, saved again
//   tables.txt             the contents of every table (types and values, or errors), showing at
//                          most N rows of each column if --max-rows is given
//   <table>.csv, .html, .xlsx, .rds
//                          each table exported with each exporter (or <table>.<ext>.error.txt
//                          with the error), where <table> is the table's name with any characters
//                          other than letters and digits replaced by _
//
// scripts/golden/java/CliHarness.java does the same with the original Java engine, and
// scripts/compare-with-java.sh runs both on files and compares the results.  R transformations are
// not run (there is no R in Node).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Table } from "../../src/engine/data/data/Table.js";
import { TableManager } from "../../src/engine/data/data/TableManager.js";
import { CSVExporter } from "../../src/engine/exporters/exporters/CSVExporter.js";
import { ExcelExporter } from "../../src/engine/exporters/exporters/ExcelExporter.js";
import type { Exporter } from "../../src/engine/exporters/exporters/Exporter.js";
import { HTMLExporter } from "../../src/engine/exporters/exporters/HTMLExporter.js";
import { RExporter } from "../../src/engine/exporters/exporters/RExporter.js";
import { TransformationManager } from "../../src/engine/transformations/transformations/TransformationManager.js";
import { describeError, dumpTables } from "./dumpTables.js";

const EXPORTERS: readonly [string, Exporter][] = [
    ["csv", new CSVExporter()],
    ["html", new HTMLExporter()],
    ["xlsx", new ExcelExporter()],
    ["rds", new RExporter()],
];

function main(args: readonly string[]): number
{
    let maxRows = Number.MAX_SAFE_INTEGER;
    if (args[0] === "--max-rows" && args.length >= 2)
    {
        maxRows = Number.parseInt(args[1]!, 10);
        args = args.slice(2);
    }
    if (args.length !== 2 || Number.isNaN(maxRows))
    {
        console.error("Usage: npm run cli -- [--max-rows N] <file.rec> <output-dir>");
        return 2;
    }
    const [input, outDir] = args as [string, string];
    mkdirSync(outDir, { recursive: true });

    const mgr = new TableManager(TransformationManager.getInstance(), { getHandledContent: _onError => new Map() });
    const loaded = mgr.loadAll(readFileSync(input, "utf8"), _widths => {});
    for (const error of loaded.errors)
        console.error("Error loading: " + error.toPlain());

    const saver = new Table.FullSaver(null);
    mgr.save(null, saver);
    writeFileSync(join(outDir, "saved.rec"), saver.getCompleteFile());
    writeFileSync(join(outDir, "tables.txt"), dumpTables(mgr, maxRows));

    for (const table of mgr.getAllTables())
    {
        const name = table.getId().getRaw().replace(/[^A-Za-z0-9]/g, "_");
        for (const [extension, exporter] of EXPORTERS)
        {
            try
            {
                writeFileSync(join(outDir, name + "." + extension), exporter.exportData(table));
            }
            catch (e)
            {
                writeFileSync(join(outDir, name + "." + extension + ".error.txt"), describeError(e) + "\n");
            }
        }
    }
    console.log(`${input}: ${mgr.getAllTables().length} tables written to ${outDir}`);
    return 0;
}

process.exitCode = main(process.argv.slice(2));
