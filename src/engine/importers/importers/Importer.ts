// Port of xyz.columnal.importers.Importer (importers module).
import type { Localized } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { DataSource } from "../../data/data/DataSource.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { JavaFile } from "../../java/JavaFile.js";
import type { SimulationConsumerNoError } from "../../utility-functional/utility/function/simulation/SimulationConsumerNoError.js";
import type { ImporterDialogs } from "./ImporterDialogs.js";

export interface Importer
{
    /**
     * Get the list of supported file types.  Each pair is the localized label for the file type,
     * and a list of file extensions (like "*.txt").
     */
    getSupportedFileTypes(): readonly string[];

    /**
     * Attempt to load the given file
     *
     * PORT-NOTE: Java takes the parent Window, to show dialogs on; here the dialogs are shown
     * through dialogs (see ImporterDialogs).  The origin is a URL, as in Java.
     *
     * @param dialogs Shows any dialogs needed
     * @param tableManager The destination table manager
     * @param src The file to read from
     * @param origin The path that the file comes from (in case of resolving relative links from file)
     * @param recordLoadedTable The callback to call if the load is successful.  If you
     *               have multiple tables to import, calling this multiple times
     *               is safe.
     */
    importFile(dialogs: ImporterDialogs, tableManager: TableManager, destPosition: CellPosition, src: JavaFile, origin: URL, recordLoadedTable: SimulationConsumerNoError<DataSource>): void;

    /**
     * The name of the importer to display to the user when picking an importer
     */
    getName(): Localized;
}
