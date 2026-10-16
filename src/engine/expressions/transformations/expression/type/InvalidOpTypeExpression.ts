// Port of xyz.columnal.transformations.expression.type.InvalidOpTypeExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import { FormatLexer } from "../../../../parsers/generated/FormatLexer.js";
import { vocabularyOf } from "../../../../parsers/grammar/Vocabularies.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import { OutputBuilder } from "../../../../types/loadsave/OutputBuilder.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Expression } from "../Expressions.js";
import { TypeExpression } from "./TypeExpressions.js";

export class InvalidOpTypeExpression extends TypeExpression
{
    private readonly items: readonly TypeExpression[];

    public constructor(items: readonly TypeExpression[])
    {
        super();
        this.items = items;
    }

    public override save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
    {
        if (saveDestination.needKeywords())
            return OutputBuilder.token(vocabularyOf(FormatLexer), FormatLexer.INVALIDOPS) + " (" +
                this.items.map(item => item.save(saveDestination, renames)).join(", ")
                + ")";
        else
            return this.items.map(item => item.save(saveDestination, renames)).join("");
    }

    public override toDataType(_typeManager: TypeManager): DataType | null
    {
        return null;
    }

    public override toJellyType(_typeManager: TypeManager, _jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        throw new TypeExpression.UnJellyableTypeExpression("Invalid type expression: " + this.toString(), this);
    }

    public override isEmpty(): boolean
    {
        return this.items.length === 0;
    }

    public override toStyledString(): StyledString
    {
        return StyledString.s("Invalid"); // TODO
    }

    public _test_getItems(): readonly TypeExpression[]
    {
        return this.items;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof InvalidOpTypeExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.items, that.items);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.items);
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        if (this === toReplace)
            return replaceWith;
        else
            return new InvalidOpTypeExpression(Utility.mapListI(this.items, e => e.replaceSubExpression(toReplace, replaceWith)));
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        return null;
    }
}
