// Port of xyz.columnal.data.ColumnMaker (data module).
import type { ValueClass } from "../../types/data/datatype/DataType.js";
import type { DataParser } from "../../parsers/generated/DataParser.js";
import type { DataParser2 } from "../../parsers/generated/DataParser2.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import type { Value } from "../../utility/utility/Value.js";
import { ColumnUtility } from "./ColumnUtility.js";
import type { EditableColumn } from "./EditableColumn.js";
import type { RecordSet } from "./RecordSet.js";

export class ColumnMaker<C extends EditableColumn, V extends Value>
{
    private readonly addToColumn: (column: C, value: Either<string, V>) => void;
    private readonly parseValue1: (p: DataParser) => Either<string, V>;
    private readonly parseValue: (p: DataParser2) => Either<string, V>;
    private readonly makeColumn: (rs: RecordSet, defaultValue: V) => C;
    private readonly defaultValue: V;
    private column: C | null = null;

    public constructor(defaultValue: Value, valueClass: ValueClass<V>, makeColumn: (rs: RecordSet, defaultValue: V) => C, addToColumn: (column: C, value: Either<string, V>) => void, parseValue1: (p: DataParser) => Either<string, V>, parseValue: (p: DataParser2) => Either<string, V>)
    {
        this.makeColumn = makeColumn;
        this.addToColumn = addToColumn;
        this.parseValue1 = parseValue1;
        this.parseValue = parseValue;
        this.defaultValue = ColumnUtility.castValue(defaultValue, valueClass);
    }

    // Java: apply, implementing SimulationFunctionInt<RecordSet, EditableColumn>
    public apply(rs: RecordSet): EditableColumn
    {
        this.column = this.makeColumn(rs, this.defaultValue);
        return this.column;
    }

    // Only valid to call after apply:
    public loadRow1(p: DataParser): void
    {
        if (this.column === null)
            throw new InternalException("Calling loadRow before column creation");
        this.addToColumn(this.column, this.parseValue1(p));
    }

    // Only valid to call after apply:
    public loadRow(p: DataParser2): void
    {
        if (this.column === null)
            throw new InternalException("Calling loadRow before column creation");
        this.addToColumn(this.column, this.parseValue(p));
    }
}
