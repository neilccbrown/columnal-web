// Port of xyz.columnal.transformations.expression.type.IdentTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaObjectsHash } from "../../../../java/JavaObject.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import { TypeId } from "../../../../types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { Log } from "../../../../utility/log/Log.js";
import type { Expression } from "../Expressions.js";
import { TypeExpression } from "./TypeExpressions.js";

export class IdentTypeExpression extends TypeExpression
{
    private readonly value: ExpressionIdentifier;

    public constructor(value: ExpressionIdentifier)
    {
        super();
        this.value = value;
    }

    public override toStyledString(): StyledString
    {
        return StyledString.s(this.value);
    }

    public override save(_saveDestination: Expression.SaveDestination, _renames: TableAndColumnRenames): string
    {
        return this.value;
    }

    public override toDataType(typeManager: TypeManager): DataType | null
    {
        // TODO pass in type variable subsitutions to this method
        try
        {
            const typeDefinition = typeManager.lookupDefinition(new TypeId(this.value));
            if (typeDefinition === null)
                return null;
            else
                return typeDefinition.instantiate([], typeManager);
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            if (e instanceof InternalException)
                Log.log(e);
            return null;
        }
    }

    public override toJellyType(_typeManager: TypeManager, jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        return jellyRecorder.record(JellyType.typeVariable(this.value), this);
    }

    public override isEmpty(): boolean
    {
        return this.value.length === 0;
    }

    public override asIdent(): ExpressionIdentifier
    {
        return this.value;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof IdentTypeExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return this.value === that.value;
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.value);
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        return this === toReplace ? replaceWith : this;
    }
}
