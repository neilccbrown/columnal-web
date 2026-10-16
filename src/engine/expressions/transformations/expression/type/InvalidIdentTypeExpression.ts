// Port of xyz.columnal.transformations.expression.type.InvalidIdentTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaObjectsHash } from "../../../../java/JavaObject.js";
import { FormatLexer } from "../../../../parsers/generated/FormatLexer.js";
import { vocabularyOf } from "../../../../parsers/grammar/Vocabularies.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import { OutputBuilder } from "../../../../types/loadsave/OutputBuilder.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { IdentifierUtility } from "../../../../utility/utility/IdentifierUtility.js";
import type { Expression } from "../Expressions.js";
import { IdentTypeExpression, TypeExpression } from "./TypeExpressions.js";

export class InvalidIdentTypeExpression extends TypeExpression
{
    private readonly value: string;

    public constructor(value: string)
    {
        super();
        this.value = value;
    }

    public override toStyledString(): StyledString
    {
        return StyledString.s(this.value);
    }

    public override save(saveDestination: Expression.SaveDestination, _renames: TableAndColumnRenames): string
    {
        if (saveDestination.needKeywords())
            return OutputBuilder.token(vocabularyOf(FormatLexer), FormatLexer.INCOMPLETE) + " " + OutputBuilder.quoted(this.value);
        else
            return this.value;
    }

    public override toDataType(_typeManager: TypeManager): DataType | null
    {
        return null;
    }

    public override toJellyType(_typeManager: TypeManager, _jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        throw new TypeExpression.UnJellyableTypeExpression("Invalid type expression: \"" + this.value + "\"", this);
    }

    public override isEmpty(): boolean
    {
        return this.value.length === 0;
    }

    public _test_getContent(): string
    {
        return this.value;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof InvalidIdentTypeExpression) || o.constructor !== this.constructor) return false;
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

    // IdentExpression if possible, otherwise InvalidIdentExpression
    public static identOrUnfinished(src: string): TypeExpression
    {
        const valid = IdentifierUtility.asExpressionIdentifier(src);
        if (valid !== null)
            return new IdentTypeExpression(valid);
        else
            return new InvalidIdentTypeExpression(src);
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        return null;
    }
}
