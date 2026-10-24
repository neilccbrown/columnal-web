// Port of xyz.columnal.importers.RImporter (importers module).
//
// PORT-NOTE: the dialog for picking which tables to import (Java's PickImportsDialog) is rebuilt in
// the GUI and shown through ImporterDialogs.pickRTables.
import type { Localized } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { DataSource } from "../../data/data/DataSource.js";
import { ImmediateDataSource } from "../../data/data/DataSources.js";
import type { EditableRecordSet } from "../../data/data/EditableRecordSet.js";
import { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { TableId } from "../../identifiers/id/TableId.js";
import { IOException } from "../../java/JavaExceptions.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { JavaRandom } from "../../java/JavaRandom.js";
import { Platform } from "../../java/Platform.js";
import { ConvertFromR } from "../../r-interop/rinterop/ConvertFromR.js";
import { RRead } from "../../r-interop/rinterop/RRead.js";
import type { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationConsumerNoError } from "../../utility-functional/utility/function/simulation/SimulationConsumerNoError.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Workers } from "../../utility/utility/Workers.js";
import type { Importer } from "./Importer.js";
import type { ImporterDialogs } from "./ImporterDialogs.js";
import { TextImporter } from "./TextImporter.js";

export class RImporter implements Importer
{
    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.rds", "*.Rdata"];
    }

    public importFile(dialogs: ImporterDialogs, tableManager: TableManager, destPosition: CellPosition, src: JavaFile, origin: URL, onLoad: SimulationConsumerNoError<DataSource>): void
    {
        Workers.onWorkerThread("Loading " + src.toString() + " " + origin.toString(), Workers.Priority.LOAD_FROM_DISK, () =>
        {
            try
            {
                const tables = ConvertFromR.convertRToTable(tableManager.getTypeManager(), RRead.readRData(src), true);

                switch (tables.length)
                {
                    case 0:
                        throw new UserException("No tables found in file");
                    case 1:
                        this.register(tableManager, destPosition, tables[Symbol.iterator](), onLoad);
                        break;
                    default:
                        // Java: FXUtility.runFX(...)
                        Platform.runLater(() =>
                        {
                            dialogs.pickRTables(tables, pickedOrNull =>
                            {
                                const picked = pickedOrNull ?? [];
                                if (picked.length !== 0)
                                {
                                    Workers.onWorkerThread("Loading " + src.toString() + " " + origin.toString(), Workers.Priority.LOAD_FROM_DISK, () => this.register(tableManager, destPosition, picked[Symbol.iterator](), onLoad));
                                }
                            });
                        });
                        break;
                }
            }
            catch (ex)
            {
                if (!(ex instanceof InternalException || ex instanceof UserException || ex instanceof IOException))
                    throw ex;
                // Java: FXUtility.logAndShowError("import.r.error", ex)
                TextImporter.logAndShowError("import.r.error", ex);
            }
        });
    }

    private register(tableManager: TableManager, cellPosition: CellPosition, tables: Iterator<Pair<string, EditableRecordSet>>, onLoad: SimulationConsumerNoError<DataSource>): void
    {
        const next = tables.next();
        if (!next.done)
        {
            const reg = next.value;
            const immediateDataSource = new ImmediateDataSource(tableManager, new Table.InitialLoadDetails(new TableId(IdentifierUtility.fixExpressionIdentifier(reg.getFirst(), IdentifierUtility.identNum("RTable", new JavaRandom().nextInt(10000)))), null, cellPosition, null), reg.getSecond());
            onLoad(immediateDataSource);
            // Recurse:
            const width = immediateDataSource.getData().getColumns().length;
            this.register(tableManager, cellPosition.offsetByRowCols(0, width + 1), tables, onLoad);
        }
    }

    public getName(): Localized
    {
        return TranslationUtility.getString("importer.r.files");
    }
}
