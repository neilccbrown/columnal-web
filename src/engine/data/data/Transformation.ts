// Port of xyz.columnal.data.Transformation (data module).
// PORT-NOTE: Java Streams of table ids become arrays, and getSources returns a HashSet (which,
// like Guava's ImmutableSet, iterates in insertion order).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { TableAndColumnRenames } from "../../identifiers/id/TableAndColumnRenames.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import { HashSet } from "../../java/HashMap.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { Platform } from "../../java/Platform.js";
import { MainLexer } from "../../parsers/generated/MainLexer.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { Table } from "./Table.js";
import type { TableManager } from "./TableManager.js";
import { TableOperations } from "./TableOperations.js";

/**
 * Created by neil on 21/10/2016.
 */
export abstract class Transformation extends Table
{
    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails)
    {
        super(mgr, initialLoadDetails);
    }

    public getSources(): HashSet<TableId>
    {
        return new HashSet<TableId>([...this.getPrimarySources(), ...this.getSourcesFromExpressions()]);
    }

    // Which tables are used in expressions?
    protected abstract getSourcesFromExpressions(): readonly TableId[];

    // Which tables are declared as our primary source, if any (for filter, transform, concat, etc)
    protected abstract getPrimarySources(): readonly TableId[];

    public save(destination: JavaFile | null, then: Table.Saver, renames: TableAndColumnRenames): void
    {
        const b = new OutputBuilder();
        b.t(MainLexer.TRANSFORMATION).begin().raw(this.saveTag.getTag()).nl();
        b.pushPrefix(this.saveTag);
        b.id(renames.tableId(this.getId())).nl();
        b.id(this.getTransformationName(), OutputBuilder.QuoteBehaviour.DEFAULT).nl();
        b.t(MainLexer.SOURCE);
        for (const src of this.getPrimarySources())
            b.id(renames.tableId(src));
        b.nl();
        b.begin().nl();
        for (const line of this.saveDetail(destination, renames))
        {
            b.raw(line).nl();
        }
        b.end().nl();
        this.savePosition(b);
        b.pop();
        b.end().raw(this.saveTag.getTag()).t(MainLexer.TRANSFORMATION).nl();
        then.saveTable(b.toString());
    }

    // The name as used when saving:
    protected abstract getTransformationName(): string;

    protected abstract saveDetail(destination: JavaFile | null, renames: TableAndColumnRenames): readonly string[];

    // hashCode and equals must be implemented properly (used for testing).
    // To make sure we don't forget, we introduce abstract methods which must
    // be overridden.  (We don't make hashCode and equals themselves abstract
    // because subclasses would then lose access to Table.hashCode which they'd need to implement their hash code).
    public override hashCode(): number
    {
        return (Math.imul(31, super.hashCode()) + this.transformationHashCode()) | 0;
    }

    protected abstract transformationHashCode(): number;

    public override equals(obj: unknown): boolean
    {
        if (!super.equals(obj))
            return false;
        return this.transformationEquals(obj as Transformation);
    }

    protected abstract transformationEquals(obj: Transformation): boolean;

    // Mainly for testing:
    public override toString(): string
    {
        let b = "";
        this.save(null, {
            saveTable: (tableSrc: string) => { b += tableSrc; },
            saveUnit: (unitSrc: string) => { b += unitSrc; },
            saveType: (typeSrc: string) => { b += typeSrc; },
            saveComment: (commentSrc: string) => { b += commentSrc; },
        }, TableAndColumnRenames.EMPTY);
        return b;
    }

    // Should be overridden by any transformation where any of these are possible.
    public override getOperations(): TableOperations
    {
        return new TableOperations(this.getManager().getRenameTableOperation(this), _c => null, null, null, null);
    }

    protected ensureBoolean(dataType: DataType): void
    {
        if (!dataType.equals(DataType.BOOLEAN))
        {
            throw new UserException("Required Boolean type, but found: " + dataType.toString());
        }
    }

    protected addManualEditSet(columnId: ColumnId, original: DataTypeValue): DataTypeValue
    {
        return original.withSet((index, value) =>
        {
            // Need to ask the user if they want a manual edit
            Platform.runLater(() =>
            {
                const display = this.getDisplay();
                if (display !== null)
                    display.promptForTransformationEdit(index, new Pair(columnId, original.getType()), value);
            });

            throw new Transformation.SilentCancelEditException("Can't edit a transformation's data.");
        });
    }
}

export namespace Transformation
{
    export class SilentCancelEditException extends UserException
    {
        public constructor(message: string)
        {
            super(message);
        }
    }
}
