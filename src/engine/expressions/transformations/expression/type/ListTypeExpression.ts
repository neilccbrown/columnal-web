// Port of xyz.columnal.transformations.expression.type.ListTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import type { Expression } from "../Expressions.js";
import { TypeExpression } from "./TypeExpressions.js";

export class ListTypeExpression extends TypeExpression
{
    private readonly innerType: TypeExpression;

    public constructor(innerType: TypeExpression)
    {
        super();
        this.innerType = innerType;
    }

    public override toStyledString(): StyledString
    {
        return StyledString.squareBracket(this.innerType.toStyledString());
    }

    public override save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
    {
        return "[" + this.innerType.save(saveDestination, renames) + "]";
    }

    public override toDataType(typeManager: TypeManager): DataType | null
    {
        // Be careful here; null is a valid value inside a list type, but we don't want to pass null!
        const inner = this.innerType.toDataType(typeManager);
        if (inner !== null)
            return DataType.array(inner);
        return null;
    }

    public override toJellyType(typeManager: TypeManager, jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        return jellyRecorder.record(JellyType.list(this.innerType.toJellyType(typeManager, jellyRecorder)), this);
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public _test_getContent(): TypeExpression
    {
        return this.innerType;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof ListTypeExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.innerType, that.innerType);
    }

    public override hashCode(): number
    {

        return javaObjectsHash(this.innerType);
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new ListTypeExpression(this.innerType.replaceSubExpression(toReplace, replaceWith));
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        return null;
    }
}
