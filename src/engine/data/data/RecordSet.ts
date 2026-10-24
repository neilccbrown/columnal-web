// Port of xyz.columnal.data.RecordSet (data module).
// (The large commented-out getDisplayColumns method in the Java is omitted.)
import type { TableDataRowIndex } from "../../anns/Annotations.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { HashSet } from "../../java/HashMap.js";
import { Platform } from "../../java/Platform.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { Log } from "../../utility/log/Log.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { Column } from "./Column.js";

/**
 * A RecordSet is a collection of columns.  It is the nitty gritty data part
 * of Table, which deals with wider book-keeping.
 *
 * RecordSet assumptions:
 *
 *  - All of the columns in RecordSet have the same number of entries.
 *    A RecordSet will not be bottom-ragged.
 *  - This number of entries is not known a priori.  See Column.indexValid
 *    for a discussion of that method.
 *  - Columns are otherwise treated independently.  Just because one column
 *    value is loaded doesn't mean that any values in any other columns
 *    will/won't be loaded.
 */
export abstract class RecordSet
{
    protected readonly columns: Column[];

    protected listener: RecordSet.RecordSetListener | null = null;

    // Java has two constructors: () and (List<SimulationFunction<RecordSet, C>> columns).
    // (Public, unlike Java's protected (), so that anonymous subclasses can be made in other modules; the class is abstract.)
    public constructor(columns?: readonly SimulationFunction<RecordSet, Column>[])
    {
        this.columns = [];
        if (columns === undefined)
            return;
        const colNames = new HashSet<ColumnId>();
        for (const f of columns)
        {
            const newCol = f(this);
            this.columns.push(newCol);
            colNames.add(newCol.getName());
        }
        if (colNames.size !== columns.length)
            throw new UserException("Duplicate column names found: " + this.columns.map(c => c.getName().getOutput()).join(", "));
    }

    public getColumn(name: ColumnId): Column
    {
        for (const c of this.columns)
        {
            if (c.getName().equals(name))
                return c;
        }
        throw new UserException("Column not found: {{{" + name.getRaw() + "}}}");
    }

    public getColumnOrNull(name: ColumnId): Column | null
    {
        for (const c of this.columns)
        {
            if (c.getName().equals(name))
                return c;
        }
        return null;
    }

    //package-protected:
    public abstract indexValid(index: number): boolean;

    // Only use when you really need to know the length!
    // Override in subclasses if you can do it faster
    public getLength(): TableDataRowIndex
    {
        let i = 0;
        while (this.indexValid(i))
        {
            i += 1;
        }
        return i;
    }

    public getColumns(): readonly Column[]
    {
        return this.columns;
    }

    // Java: debugGetVals() and debugGetVals(int)
    public debugGetVals(i?: number): string
    {
        if (i !== undefined)
        {
            return this.columns.map(c =>
            {
                try
                {
                    return c.getName().getRaw() + ":\"" + String(c.getType().getCollapsed(i)) + "\"";
                }
                catch (e)
                {
                    return "ERR:" + (e instanceof Error ? e.message : String(e));
                }
            }).join(", ");
        }
        try
        {
            return this.columns.map(c =>
            {
                try
                {
                    return c.getName().toString() + "::" + String(c.getType());
                }
                catch (e)
                {
                    if (e instanceof InternalException || e instanceof UserException)
                        return c.getName().toString() + "::TYPE_ERR";
                    throw e;
                }
            }).join(" ") +
                Array.from({ length: this.getLength() }, (_x, index) => this.debugGetVals(index)).join("\n");
        }
        catch (e)
        {
            if (e instanceof InternalException || e instanceof UserException)
                return "ERR:" + e.getLocalizedMessage();
            throw e;
        }
    }

    public getColumnIds(): ColumnId[]
    {
        return Utility.mapListI(this.columns, c => c.getName());
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof RecordSet)) return false;

        const recordSet = o;

        if (this.columns.length !== recordSet.columns.length) return false;
        try
        {
            const length = this.getLength();
            if (length !== recordSet.getLength()) return false;
            for (const usCol of this.columns)
            {
                const themCol = recordSet.getColumn(usCol.getName()); // Throws if not there
                const us = usCol.getType();
                const them = themCol.getType();
                if (!us.getType().equals(them.getType()))
                    return false;
                for (let i = 0; i < length; i++)
                {
                    const ax = this.getCollapsedErr(us, i);
                    const bx = this.getCollapsedErr(them, i);
                    const same = ax.eitherEx(aerr => bx.eitherEx(berr => aerr === berr, _bv => false), av => bx.eitherEx(_ae => false, bv => Utility.compareValues(av, bv) === 0));
                    if (!same)
                        return false;
                }
            }
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            Log.log(e);
            // Only used for testing anyway:
            return false;
        }
        return true;
    }

    private getCollapsedErr(dataTypeValue: DataTypeValue, index: number): Either<string, Value>
    {
        try
        {
            return Either.right(dataTypeValue.getCollapsed(index));
        }
        catch (e)
        {
            if (!(e instanceof InvalidImmediateValueException))
                throw e;
            return Either.left(e.getInvalid());
        }
    }

    public hashCode(): number
    {
        const result = this.columns.length;
        // It's bad performance but semantically valid to not compare the column
        // values here.  Lots of hash code collisions but that's valid.
        return result;
    }

    public setListener(listener: RecordSet.RecordSetListener): void
    {
        this.listener = listener;
    }

    public modified(_columnId: ColumnId | null, rowIndex: number | null): void
    {
        Platform.runLater(() =>
        {
            if (this.listener !== null)
                this.listener.modifiedDataItems(rowIndex === null ? -1 : rowIndex, rowIndex === null ? -1 : rowIndex);
        });
    }
}

export namespace RecordSet
{
    export interface RecordSetListener
    {
        // Range of rows modified.  -1 for both params means all rows
        modifiedDataItems(startRowIncl: number, endRowIncl: number): void;

        // Starting at startRowIncl, removedRowsCount (>= 0) was removed,
        // and in its place was added addedRowsCount (>= 0).
        removedAddedRows(startRowIncl: number, removedRowsCount: number, addedRowsCount: number): void;

        addedColumn(newColumn: Column): void;

        removedColumn(oldColumnId: ColumnId): void;
    }
}
