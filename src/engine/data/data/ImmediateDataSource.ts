// Port of xyz.columnal.data.ImmediateDataSource (data module).
// Import it through DataSources.ts (see DataSource.ts).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../identifiers/id/TableId.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { FormatLexer } from "../../parsers/generated/FormatLexer.js";
import { MainLexer } from "../../parsers/generated/MainLexer.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { DataSource } from "./DataSources.js";
import type { EditableRecordSet } from "./EditableRecordSet.js";
import type { Table } from "./Table.js";
import type { TableManager } from "./TableManager.js";
import { TableOperations } from "./TableOperations.js";

/**
 * Created by neil on 09/11/2016.
 */
export class ImmediateDataSource extends DataSource
{
    private readonly data: EditableRecordSet;

    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, data: EditableRecordSet)
    {
        super(mgr, initialLoadDetails);
        this.data = data;
    }

    public getData(): EditableRecordSet
    {
        return this.data;
    }

    public save(_destination: JavaFile | null, then: Table.Saver, renames: TableAndColumnRenames): void
    {
        //dataSourceImmedate : DATA tableId BEGIN NEWLINE;
        //immediateDataLine : ITEM+ NEWLINE;
        //dataSource : (dataSourceLinkHeader | (dataSourceImmedate immediateDataLine* END DATA NEWLINE)) dataFormat;

        const formatVocab = vocabularyOf(FormatLexer);
        const b = new OutputBuilder();
        b.t(MainLexer.DATA).begin().raw(this.saveTag.getTag());
        b.pushPrefix(this.saveTag);
        b.nl();
        b.id(renames.tableId(this.getId())).nl();
        b.t(MainLexer.FORMAT, vocabularyOf(MainLexer)).begin().nl();
        const errorTitle = TranslationUtility.getString("error.saving.table", this.getId().getRaw());
        ErrorHandler.getErrorHandler().alertOnError_(errorTitle, () =>
        {
            for (const c of this.data.getColumns())
            {
                b.t(FormatLexer.COLUMN, formatVocab).unquoted(renames.columnId(this.getId(), c.getName(), null).getSecond());
                b.t(FormatLexer.TYPE, formatVocab);
                c.getType().getType().save(b);

                const defaultValue = c.getDefaultValue();
                if (defaultValue !== null)
                {
                    b.t(FormatLexer.DEFAULT, formatVocab);
                    b.dataValue(c.getType().getType(), defaultValue);
                }
                b.nl();
            }
        });
        b.end().t(MainLexer.FORMAT).nl();
        b.t(MainLexer.VALUES).begin().nl();
        ErrorHandler.getErrorHandler().alertOnError_(errorTitle, () =>
        {
            for (let i = 0; this.data.indexValid(i); i++)
            {
                b.indent();
                let first = true;
                for (const c of this.data.getColumns())
                {
                    if (!first)
                        b.raw(",");
                    b.data(c.getType(), i);
                    first = false;
                }
                b.nl();
            }
        });
        b.end().t(MainLexer.VALUES).nl();
        this.savePosition(b);
        b.pop();
        b.end().raw(this.saveTag.getTag()).t(MainLexer.DATA, vocabularyOf(MainLexer)).nl();
        then.saveTable(b.toString());
    }

    public getOperations(): TableOperations
    {
        return new TableOperations(this.getManager().getRenameTableOperation(this)
        , _c => (deleteColumnName: ColumnId) =>
        {
            this.data.deleteColumn(deleteColumnName);
        }, appendRowCount =>
        {
            ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.finding.length", this.getId().getRaw()), () =>
            {
                this.data.insertRows(this.data.getLength(), appendRowCount);
            });
        }, (rowIndex, insertRowCount) =>
        {
            this.data.insertRows(rowIndex, insertRowCount);
        }, (deleteRowFrom, deleteRowCount) =>
        {
            this.data.removeRows(deleteRowFrom, deleteRowCount);
        });
    }

    public dataEquals(o: DataSource): boolean
    {
        const that = o as ImmediateDataSource;

        return this.data.equals(that.data);
    }

    public dataHashCode(): number
    {
        return this.data.hashCode();
    }

    public getSuggestedName(): TableId
    {
        return new TableId("Data");
    }
}
