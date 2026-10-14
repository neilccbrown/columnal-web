// Port of xyz.columnal.data.ErrorColumn (data module).
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import { GetValue, type DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { StyledString } from "../../utility-error/styled/StyledString.js";
import type { Value } from "../../utility/utility/Value.js";
import { Column } from "./Column.js";
import type { RecordSet } from "./RecordSet.js";

/**
 * A column which shows only error values.
 */
export class ErrorColumn extends Column
{
    private readonly dataTypeValue: DataTypeValue;

    public constructor(recordSet: RecordSet, typeManager: TypeManager, columnId: ColumnId, errorText: StyledString)
    {
        super(recordSet, columnId);
        try
        {
            this.dataTypeValue = typeManager.getVoidType().instantiate([], typeManager).fromCollapsed(GetValue.of<Value>((_i, _prog) =>
            {
                throw new UserException(errorText);
            }));
        }
        catch (e)
        {
            if (e instanceof UserException)
                throw new InternalException("Error accessing void type", e);
            throw e;
        }
    }

    public getType(): DataTypeValue
    {
        return this.dataTypeValue;
    }

    public getAlteredState(): Column.AlteredState
    {
        // We are an error column because we failed to be a calculation, so count as overwriting:
        return Column.AlteredState.OVERWRITTEN;
    }

    public override getEditableStatus(): Column.EditableStatus
    {
        return new Column.EditableStatus(false, null);
    }
}
