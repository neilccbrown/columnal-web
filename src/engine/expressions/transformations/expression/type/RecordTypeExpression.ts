// Port of xyz.columnal.transformations.expression.type.RecordTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { HashMap } from "../../../../java/HashMap.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import { JellyTypeRecord, type JellyType } from "../../../../types/jellytype/JellyTypes.js";
import type { Pair } from "../../../../utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Expression } from "../Expressions.js";
import { TypeExpression } from "./TypeExpressions.js";

export class RecordTypeExpression extends TypeExpression
{
    private readonly members: readonly Pair<ExpressionIdentifier, TypeExpression>[];

    public constructor(members: readonly Pair<ExpressionIdentifier, TypeExpression>[])
    {
        super();
        this.members = members;
    }

    public override toDataType(typeManager: TypeManager): DataType | null
    {
        // PORT-NOTE: Java's HashMap order becomes the record type's field order, so it is kept.
        const types = HashMap.javaOrder<ExpressionIdentifier, DataType>();

        for (const member of this.members)
        {
            const memberType = member.getSecond().toDataType(typeManager);
            if (memberType === null || types.has(member.getFirst()))
                return null; // Duplicate field
            types.set(member.getFirst(), memberType);
        }

        return DataType.record(types);
    }

    public override toJellyType(typeManager: TypeManager, jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        // PORT-NOTE: Java's HashMap order becomes the record type's field order, so it is kept.
        const types = HashMap.javaOrder<ExpressionIdentifier, JellyTypeRecord.Field>();

        for (const member of this.members)
        {
            const memberType = member.getSecond().toJellyType(typeManager, jellyRecorder);
            if (types.has(member.getFirst()))
                throw new TypeExpression.UnJellyableTypeExpression("Duplicate field in record: \"" + member.getFirst() + "\"", this);
            types.set(member.getFirst(), new JellyTypeRecord.Field(memberType, true));
        }

        return jellyRecorder.record(new JellyTypeRecord(new Map(types), true), this);
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof RecordTypeExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.members, that.members);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.members);
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new RecordTypeExpression(Utility.mapListI(this.members, p => p.mapSecond(e => e.replaceSubExpression(toReplace, replaceWith))));
    }

    public override toStyledString(): StyledString
    {
        return StyledString.roundBracket(StyledString.joining(this.members.map(s => StyledString.concat(StyledString.s(s.getFirst() + ": "), s.getSecond().toStyledString())), ", "));
    }

    public override save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
    {
        return "(" + this.members.map(m => m.getFirst() + ": " + m.getSecond().save(saveDestination, renames)).join(", ") + ")";
    }

    public _test_getItems(): readonly Pair<ExpressionIdentifier, TypeExpression>[]
    {
        return this.members;
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        return null;
    }
}
