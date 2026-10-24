// Port of xyz.columnal.exporters.CSVExporter (exporters module).
import type { Localized } from "../../anns/Annotations.js";
import type { Table } from "../../data/data/Table.js";
import { javaReplace, javaUtf8Bytes } from "../../java/JavaString.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
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
                out += CSVExporter.quoteCSV(CSVExporter.valueOrInvalid(() => DataTypeUtility.valueToString(columns[i]!.getType().getCollapsed(row))));
                if (i < columns.length - 1)
                    out += ",";
            }
            out += "\n";
        }
        return javaUtf8Bytes(out);
    }

    /**
     * PORT-NOTE: bug fix.  Java let the InvalidImmediateValueException for an invalid value (one that
     * was entered but doesn't fit the column's type) through, so the whole export failed; now the
     * invalid value is exported as it was entered.  (Other errors still fail the export.)
     */
    public static valueOrInvalid(getValue: () => string): string
    {
        try
        {
            return getValue();
        }
        catch (e)
        {
            if (!(e instanceof InvalidImmediateValueException))
                throw e;
            return e.getInvalid();
        }
    }

    /**
     * PORT-NOTE: bug fix.  Java replaced each quote in the text with three quotes, where CSV doubles
     * them, so a quote in the data came out as two quotes when the file was read.
     */
    private static quoteCSV(original: string): string
    {
        return "\"" + javaReplace(original, "\"", "\"\"") + "\"";
    }
}
