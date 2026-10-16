// Port of xyz.columnal.transformations.expression.type.TypePrimitiveLiteral (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import { OutputBuilder } from "../../../../types/loadsave/OutputBuilder.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import type { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { Log } from "../../../../utility/log/Log.js";
import type { Expression } from "../Expressions.js";
import { InvalidIdentTypeExpression, TypeExpression } from "./TypeExpressions.js";

// For a named, fully-formed type (not a tagged type name), not including numeric types
export class TypePrimitiveLiteral extends TypeExpression
{
    private readonly dataType: DataType;

    public constructor(dataType: DataType)
    {
        super();
        this.dataType = dataType;
    }

    public toDisplay(): string
    {
        try
        {
            return this.dataType.toDisplay(false);
        }
        catch (e)
        {
            if (!(e instanceof UserException || e instanceof InternalException))
                throw e;
            Log.log(e);
            return "";
        }
    }

    public override toStyledString(): StyledString
    {
        return this.dataType.toStyledString();
    }

    public override save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
    {
        try
        {
            return this.dataType.save(new OutputBuilder()).toString();
        }
        catch (e)
        {
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            return new InvalidIdentTypeExpression("").save(saveDestination, renames);
        }
    }

    public override toDataType(_typeManager: TypeManager): DataType | null
    {
        return this.dataType;
    }

    public override toJellyType(_typeManager: TypeManager, jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        return jellyRecorder.record(JellyType.fromConcrete(this.dataType), this);
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public _test_getType(): DataType
    {
        return this.dataType;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TypePrimitiveLiteral) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.dataType, that.dataType);
    }

    public override hashCode(): number
    {

        return javaObjectsHash(this.dataType);
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        return this.dataType.toString();
    }
}
