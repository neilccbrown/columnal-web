// Port of xyz.columnal.error.expressions.ExpressionErrorException (transformations module).
import type { Table } from "../../../data/data/Table.js";
import type { Expression } from "../../../expressions/transformations/expression/Expressions.js";
import type { TypeState } from "../../../expressions/transformations/expression/TypeState.js";
import type { TableId } from "../../../identifiers/id/TableId.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import type { StyledString } from "../../../utility-error/styled/StyledString.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import type { FXPlatformSupplierInt } from "../../../utility-functional/utility/function/fx/FXPlatformSupplierInt.js";

export class ExpressionErrorException extends UserException
{
    public readonly editableExpression: ExpressionErrorException.EditableExpression;

    public constructor(styledString: StyledString, editableExpression: ExpressionErrorException.EditableExpression)
    {
        super(styledString);
        this.editableExpression = editableExpression;
    }
}

export namespace ExpressionErrorException
{
    export abstract class EditableExpression
    {
        public readonly current: Expression;
        public readonly srcTableId: TableId | null;
        public readonly columnLookup: Expression.ColumnLookup;
        public readonly makeTypeState: FXPlatformSupplierInt<TypeState>;
        public readonly expectedType: DataType | null;

        // Java: protected.  Public so that anonymous subclasses can be made (the class is abstract).
        public constructor(current: Expression, srcTableId: TableId | null, columnLookup: Expression.ColumnLookup, makeTypeState: FXPlatformSupplierInt<TypeState>, expectedType: DataType | null)
        {
            this.current = current;
            this.srcTableId = srcTableId;
            this.columnLookup = columnLookup;
            this.makeTypeState = makeTypeState;
            this.expectedType = expectedType;
        }

        public abstract replaceExpression(changed: Expression): Table;
    }
}
