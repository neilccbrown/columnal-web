// Port of xyz.columnal.transformations.expression.type.NumberTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import { DataType } from "../../../../types/data/datatype/DataType.js";
import { NumberInfo } from "../../../../types/data/datatype/NumberInfo.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import { Unit } from "../../../../types/data/unit/Unit.js";
import { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import { JellyUnit } from "../../../../types/jellytype/JellyUnit.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { Log } from "../../../../utility/log/Log.js";
import type { Expression } from "../Expressions.js";
import { UnitExpression } from "../UnitExpressions.js";
import { TypeExpression } from "./TypeExpressions.js";

export class NumberTypeExpression extends TypeExpression
{
    private readonly unitExpression: UnitExpression | null;

    public constructor(unitExpression: UnitExpression | null)
    {
        super();
        this.unitExpression = unitExpression;
    }

    public override save(saveDestination: Expression.SaveDestination, _renames: TableAndColumnRenames): string
    {
        if (this.unitExpression === null || this.unitExpression.isEmpty() || this.unitExpression.isScalar())
            return "Number";
        else
            return "Number{" + this.unitExpression.save(saveDestination, true) + "}";
    }

    public override toDataType(typeManager: TypeManager): DataType | null
    {
        try
        {
            return this.unitExpression === null ? DataType.NUMBER : DataType.number(new NumberInfo(this.unitExpression.asUnit(typeManager.getUnitManager()).makeUnit(new Map())));
        }
        catch (e)
        {
            if (e instanceof UnitExpression.UnitLookupException)
                return null;
            if (!(e instanceof InternalException))
                throw e;
            Log.log(e);
            return null;
        }
    }

    public override toJellyType(typeManager: TypeManager, jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        if (this.unitExpression === null)
            return jellyRecorder.record(JellyType.number(JellyUnit.fromConcrete(Unit.SCALAR)), this);

        try
        {
            return jellyRecorder.record(JellyType.number(this.unitExpression.asUnit(typeManager.getUnitManager())), this);
        }
        catch (e)
        {
            if (!(e instanceof UnitExpression.UnitLookupException))
                throw e;
            throw new TypeExpression.UnJellyableTypeExpression(e.errorMessage === null ? StyledString.s("Invalid unit") : e.errorMessage, e.errorItem, e.quickFixes);
        }
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public override toStyledString(): StyledString
    {
        if (this.unitExpression === null)
            return StyledString.s("Number");
        else
            return StyledString.concat(StyledString.s("Number{"), this.unitExpression.toStyledString(), StyledString.s("}"));
    }

    public _test_getUnits(): UnitExpression | null
    {
        return this.unitExpression;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof NumberTypeExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.unitExpression, that.unitExpression)
            || (this.unitExpression === null && that.unitExpression !== null && that.unitExpression.isScalar())
            || (that.unitExpression === null && this.unitExpression !== null && this.unitExpression.isScalar());
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.unitExpression);
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        return this === toReplace ? replaceWith : this;
    }

    public hasUnit(): boolean
    {
        return this.unitExpression !== null;
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        if (this.unitExpression === null)
            return "Number";
        else
            return null;

    }
}
