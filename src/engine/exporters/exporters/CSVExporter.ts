// Port of xyz.columnal.exporters.CSVExporter (exporters module).
import type { Localized } from "../../anns/Annotations.js";
import type { Table } from "../../data/data/Table.js";
import { javaReplace, javaUtf8Bytes } from "../../java/JavaString.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import type { Exporter } from "./Exporter.js";

export class CSVExporter implements Exporter
{
    public getName(): Localized
    {
        return TranslationUtility.getString("importer.files.text");
    }

    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.csv", "*.txt"];
    }

    public exportData(data: Table): Uint8Array
    {
        const rs = data.getData();
        // Write column names:
        let out = "";
        const columns = rs.getColumns();
        for (let i = 0; i < columns.length; i++)
        {
            const column = columns[i]!;
            out += CSVExporter.quoteCSV(column.getName().getRaw());
            if (i < columns.length - 1)
                out += ",";
        }
        out += "\n";
        for (let row = 0; rs.indexValid(row); row += 1)
        {
            for (let i = 0; i < columns.length; i++)
            {
                out += CSVExporter.quoteCSV(DataTypeUtility.valueToString(columns[i]!.getType().getCollapsed(row)));
                if (i < columns.length - 1)
                    out += ",";
            }
            out += "\n";
        }
        return javaUtf8Bytes(out);
    }

    /**
     * PORT-NOTE: Java replaces each quote in the text with three quotes, where CSV doubles them
     * (so a quote in the data comes out as two quotes when the file is read).  That is kept.
     */
    private static quoteCSV(original: string): string
    {
        return "\"" + javaReplace(original, "\"", "\"\"\"") + "\"";
    }
}
