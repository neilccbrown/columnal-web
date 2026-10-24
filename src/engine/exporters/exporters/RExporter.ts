// Port of xyz.columnal.exporters.RExporter (exporters module).
import type { Localized } from "../../anns/Annotations.js";
import type { Table } from "../../data/data/Table.js";
import { ConvertFromR } from "../../r-interop/rinterop/ConvertFromR.js";
import { ConvertToR } from "../../r-interop/rinterop/ConvertToR.js";
import { RWrite } from "../../r-interop/rinterop/RWrite.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import type { Exporter } from "./Exporter.js";

export class RExporter implements Exporter
{
    public exportData(data: Table): Uint8Array
    {
        return RWrite.writeRData(ConvertToR.convertTableToR(data.getData(), ConvertFromR.TableType.TIBBLE));
    }

    public getName(): Localized
    {
        return TranslationUtility.getString("importer.r.files");
    }

    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.rds", "*.Rdata"];
    }
}
