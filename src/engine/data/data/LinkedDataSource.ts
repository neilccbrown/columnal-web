// Port of xyz.columnal.data.LinkedDataSource (data module).  (It has no subclasses in Columnal.)
// Import it through DataSources.ts (see DataSource.ts).
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { MainLexer } from "../../parsers/generated/MainLexer.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { DataSource } from "./DataSources.js";
import type { RecordSet } from "./RecordSet.js";
import { Table } from "./Table.js";
import type { TableManager } from "./TableManager.js";
import { TableOperations } from "./TableOperations.js";

/**
 * Created by neil on 09/11/2016.
 */
export abstract class LinkedDataSource extends DataSource
{
    private readonly data: RecordSet;
    private readonly typeToken: number;
    private readonly path: JavaFile;

    public constructor(mgr: TableManager, tableId: TableId, rs: RecordSet, typeToken: number, path: JavaFile)
    {
        super(mgr, new Table.InitialLoadDetails(tableId, null, null, null));
        this.data = rs;
        this.typeToken = typeToken;
        this.path = path;
    }

    public getData(): RecordSet
    {
        return this.data;
    }

    public save(_destination: JavaFile | null, then: Table.Saver, renames: TableAndColumnRenames): void
    {
        //dataSourceLinkHeader : DATA tableId LINKED importType filePath NEWLINE;
        const b = new OutputBuilder();
        b.t(MainLexer.DATA).id(renames.tableId(this.getId())).t(MainLexer.LINKED).t(this.typeToken);
        // PORT-NOTE: Java relativizes the path against the destination, but OutputBuilder.path
        // then writes the absolute form of that relative path, resolved against the current
        // directory.  There is no current directory here, so this writes the file's own
        // absolute path (which is what Java writes when the destination is null).
        b.path(this.path.getAbsolutePath());
        b.nl();
        then.saveTable(b.toString());
    }

    public getOperations(): TableOperations
    {
        // TODO prompt to transform to non-linked table
        return new TableOperations(null, _c => null, null, null, null);
    }

    public dataEquals(o: DataSource): boolean
    {
        const that = o as LinkedDataSource;

        if (this.typeToken !== that.typeToken) return false;
        if (!this.data.equals(that.data)) return false;
        return this.path.equals(that.path);
    }

    public dataHashCode(): number
    {
        let result = this.data.hashCode();
        result = (Math.imul(31, result) + this.typeToken) | 0;
        result = (Math.imul(31, result) + this.path.hashCode()) | 0;
        return result;
    }

    public abstract notInTheFirstVersion(): void;
}
