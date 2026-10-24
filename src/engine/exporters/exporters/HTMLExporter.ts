// Port of xyz.columnal.exporters.HTMLExporter (exporters module).
import type { Localized } from "../../anns/Annotations.js";
import type { Table } from "../../data/data/Table.js";
import { javaUtf8Bytes } from "../../java/JavaString.js";
import { escapeHtml4 } from "../../java/StringEscapeUtils.js";
import { DateTimeFormatter, LocalDateTime } from "../../java/time/JavaTime.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Exporter } from "./Exporter.js";

export class HTMLExporter implements Exporter
{
    public exportData(data: Table): Uint8Array
    {
        const header = "<!DOCTYPE html>\n<html>\n<head><title>" + this.e(data.getId().getRaw()) + "</title></head>\n<body>\n<table>\n<caption>" + this.e(data.getId().getRaw()) + "</caption>\n";
        const rs = data.getData();
        const tableHeader = "<thead>\n<tr>\n" + rs.getColumnIds().map(c => "<td><b>" + this.e(c.getRaw()) + "</b></td>\n").join("") + "</tr>\n</thead>\n";
        let tableBody = "<tbody>\n";
        const length = rs.getLength();
        for (let i = 0; i < length; i++)
        {
            tableBody += "<tr>\n";
            for (const column of rs.getColumns())
            {
                tableBody += "<td>";
                const collapsed: Value = column.getType().getCollapsed(i);
                // Don't quote Text type unless part of compound type:
                if (typeof collapsed === "string")
                    tableBody += this.e(collapsed);
                else
                    tableBody += this.e(DataTypeUtility.valueToString(collapsed));
                tableBody += "</td>\n";
            }
            tableBody += "</tr>\n";
        }
        tableBody += "</tbody>\n</table>\n";
        const fullContent = header + tableHeader + tableBody + "\n<p>Exported on " + DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(LocalDateTime.now()) + "</p></body>\n</html>\n";
        return javaUtf8Bytes(fullContent);
    }

    private e(raw: string): string
    {
        return escapeHtml4(raw);
    }

    public getName(): Localized
    {
        return TranslationUtility.getString("importer.html.files");
    }

    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.html", "*.htm"];
    }
}
