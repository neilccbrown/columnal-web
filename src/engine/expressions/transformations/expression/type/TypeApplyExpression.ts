// Port of xyz.columnal.transformations.expression.type.TypeApplyExpression (expressions module).
import type { ExpressionIdentifier } from "../../../../anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../java/JavaObject.js";
import { FormatLexer } from "../../../../parsers/generated/FormatLexer.js";
import { vocabularyOf } from "../../../../parsers/grammar/Vocabularies.js";
import type { TableAndColumnRenames } from "../../../../identifiers/id/TableAndColumnRenames.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import { TypeId } from "../../../../types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import { JellyType } from "../../../../types/jellytype/JellyTypes.js";
import type { JellyUnit } from "../../../../types/jellytype/JellyUnit.js";
import { OutputBuilder } from "../../../../types/loadsave/OutputBuilder.js";
import { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { StyledString } from "../../../../utility-error/styled/StyledString.js";
import { Log } from "../../../../utility/log/Log.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Expression } from "../Expressions.js";
import { UnitExpression } from "../UnitExpressions.js";
import { RecordTypeExpression, TypeExpression, UnitLiteralTypeExpression } from "./TypeExpressions.js";

// An Nary expression applying a tagged type, e.g. Either-Int-String.  That would have three args.
export class TypeApplyExpression extends TypeExpression
{
    private readonly typeName: ExpressionIdentifier;
    private readonly arguments: readonly Either<UnitExpression, TypeExpression>[];

    public constructor(typeName: ExpressionIdentifier, args: readonly Either<UnitExpression, TypeExpression>[])
    {
        super();
        this.typeName = typeName;
        // Turn any units which are encased in a type expression wrapper
        // back into actual units:
        this.arguments = Utility.mapListI(args, arg => arg.flatMap<TypeExpression>(t => {
            if (t instanceof UnitLiteralTypeExpression)
                return Either.left<UnitExpression, TypeExpression>(t.getUnitExpression());
            else
                return Either.right<UnitExpression, TypeExpression>(t);
        }));
        if (args.length === 0)
            Log.logStackTrace("Empty arguments in type apply");
    }

    public override save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): string
    {
        let sb = "";
        if (saveDestination.needKeywords())
        {
            sb += OutputBuilder.stripQuotes(vocabularyOf(FormatLexer).getLiteralName(FormatLexer.APPLY)!);
            sb += " ";
        }
        sb += this.typeName;
        for (let i = 0; i < this.arguments.length; i++)
        {
            // Bit of a hack to look for RecordTypeExpression exactly...
            const e = this.arguments[i]!;
            sb += e.either<string>(u => "({" + u.save(saveDestination,  true) + "})", x => x instanceof RecordTypeExpression ? x.save(saveDestination, renames) : "(" + x.save(saveDestination, renames) + ")");
        }
        return sb;
    }

    public override toDataType(typeManager: TypeManager): DataType | null
    {
        // Shouldn't happen:
        if (this.arguments.length === 0)
            return null;

        const def = typeManager.getKnownTaggedTypes().get(new TypeId(this.typeName));
        if (def === undefined)
            return null;
        if (def.getTypeArguments().length !== this.arguments.length)
        {
            // Wrong number of type arguments
            return null;
        }

        // If we're here, right number of arguments!
        const typeArgs: Either<Unit, DataType>[] = [];
        for (const arg of this.arguments)
        {
            let type: Either<Unit, DataType> | null;
            try
            {
                type = Either.surfaceNull(arg.mapBothEx2<Unit | null, DataType | null>(u => u.asUnit(typeManager.getUnitManager()).makeUnit(new Map()), t => t.toDataType(typeManager)));
            }
            catch (e)
            {
                if (e instanceof InternalException)
                {
                    Log.log(e);
                    return null;
                }
                if (e instanceof UnitExpression.UnitLookupException)
                    return null;
                throw e;
            }
            if (type === null)
                return null;
            typeArgs.push(type);
        }
        try
        {
            return def.instantiate([...typeArgs], typeManager);
        }
        catch (e)
        {
            if (!(e instanceof UserException || e instanceof InternalException))
                throw e;
            return null;
        }
    }

    public override toJellyType(typeManager: TypeManager, jellyRecorder: TypeExpression.JellyRecorder): JellyType
    {
        if (this.arguments.length === 0)
            throw new InternalException("Empty type-apply expression");

        const args: Either<JellyUnit, JellyType>[] = [];

        for (let i = 0; i < this.arguments.length; i++)
        {
            const arg = this.arguments[i]!;
            args.push(arg.mapBothEx2<JellyUnit, JellyType>(u => {
                try
                {
                    return u.asUnit(typeManager.getUnitManager());
                }
                catch (e)
                {
                    if (!(e instanceof UnitExpression.UnitLookupException))
                        throw e;
                    throw new TypeExpression.UnJellyableTypeExpression(e.errorMessage === null ? StyledString.s("Invalid unit") : e.errorMessage, e.errorItem, e.quickFixes);
                }
            }, (t: TypeExpression) => t.toJellyType(typeManager, jellyRecorder)));

        }

        return jellyRecorder.record(JellyType.tagged(new TypeId(this.typeName), args), this);
    }

    public override isEmpty(): boolean
    {
        return false;
    }

    public override toStyledString(): StyledString
    {
        return StyledString.concat(StyledString.s(this.typeName), StyledString.joining(this.arguments.map(e => StyledString.roundBracket(e.either(u => StyledString.concat(StyledString.s("{"), u.toStyledString(), StyledString.s("}")), t => t.toStyledString()))), ""));
    }

    public getTypeName(): ExpressionIdentifier
    {
        return this.typeName;
    }

    // Gets arguments, without the leading identifier
    public getArgumentsOnly(): readonly Either<UnitExpression, TypeExpression>[]
    {
        return this.arguments;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TypeApplyExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return this.typeName === that.typeName && javaEquals(this.arguments, that.arguments);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.typeName, this.arguments);
    }

    public override replaceSubExpression(toReplace: TypeExpression, replaceWith: TypeExpression): TypeExpression
    {
        return new TypeApplyExpression(this.typeName, Utility.mapListI(this.arguments, x => x.map(t => t.replaceSubExpression(toReplace, replaceWith))));
    }

    public override asIdent(): ExpressionIdentifier | null
    {
        return null;
    }
}
