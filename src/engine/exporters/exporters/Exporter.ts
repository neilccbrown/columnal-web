// Port of xyz.columnal.exporters.Exporter (exporters module).
import type { Localized } from "../../anns/Annotations.js";
import type { Table } from "../../data/data/Table.js";

export interface Exporter
{
    /**
     * Do the actual export to the given file.
     *
     * PORT-NOTE: Java writes to a destination File; here the file's contents are returned, for the
     * GUI to save.  (Java's errors for failing to write the file then can't happen here.)
     */
    exportData(data: Table): Uint8Array;

    /**
     * The name of the exporter to display to the user when picking an exporter
     */
    getName(): Localized;

    /**
     * Get the list of supported file types.  Each item is a file extension (like "*.txt").
     */
    getSupportedFileTypes(): readonly string[];
}
