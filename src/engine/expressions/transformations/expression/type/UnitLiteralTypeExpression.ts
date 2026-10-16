// Port of xyz.columnal.transformations.expression.type.UnitLiteralTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import type { Expression } from "../Expressions.js";
import type { UnitExpression } from "../UnitExpressions.js";
import { TypeExpression } from "./TypeExpressions.js";

export class UnitLiteralTypeExpression extends TypeExpression
{
    private readonly unitExpression: UnitExpression;

    public constructor(unitExpression: UnitExpression)
    {
        super();
        this.unitExpression = unitExpression;
    }

    public override save(saveDestination: Expression.SaveDestination, _renames: TableAndColumnRenames): string
    {
        return "{" + this.unitExpression.save(saveDestination, true) + "}";
    }

    public override toDataType(_typeManager: TypeManager): DataType | null
    {
        return null;
    }

    public override toJellyType(_typeManager: TypeManager, _jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        throw new TypeExpression.UnJellyableTypeExpression("Unit not valid in this position", this);
    }

    public override isEmpty(): boolean
    {
        return this.unitExpression.isEmpty();
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override toStyledString(): StyledString
    {
        return StyledString.concat(StyledString.s("{"), this.unitExpression.toStyledString(), StyledString.s("}"));
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof UnitLiteralTypeExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.unitExpression, that.unitExpression);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.unitExpression);
    }

    public getUnitExpression(): UnitExpression
    {
        return this.unitExpression;
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        return null;
    }
}
