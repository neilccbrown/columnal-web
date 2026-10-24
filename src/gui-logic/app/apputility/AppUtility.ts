// Port of xyz.columnal.apputility.AppUtility (app module).
import type { ExpressionIdentifier } from "../../../engine/anns/Annotations.js";
import { ArrayExpression, BooleanLiteral, CallExpression, IdentExpression, NumericLiteral, RecordExpression, StringLiteral, TemporalLiteral, TypeLiteralExpression, type Expression } from "../../../engine/expressions/transformations/expression/Expressions.js";
import type { FunctionLookup } from "../../../engine/expressions/transformations/expression/function/FunctionLookup.js";
import { TypeExpression } from "../../../engine/expressions/transformations/expression/type/TypeExpressions.js";
import { UnitExpression } from "../../../engine/expressions/transformations/expression/UnitExpressions.js";
import { AsType } from "../../../engine/functions/transformations/function/core/AsType.js";
import { Decimal } from "../../../engine/java/JavaBigDecimal.js";
import { DataType, type TagType } from "../../../engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../engine/types/data/datatype/DataTypeUtility.js";
import type { DateTimeInfo } from "../../../engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../engine/types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../engine/types/data/datatype/TypeManager.js";
import { Unit } from "../../../engine/types/data/unit/Unit.js";
import type { Either } from "../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../engine/utility-adt/utility/adt/Pair.js";
import { UserException } from "../../../engine/utility-error/error/UserException.js";
import { TaggedValue } from "../../../engine/utility/utility/TaggedValue.js";
import { ListEx, Record, Utility } from "../../../engine/utility/utility/Utility.js";
import type { Value } from "../../../engine/utility/utility/Value.js";

export class AppUtility
{
    // Java: runs valueToExpression on the simulation thread from the FX thread
    public static valueToExpressionFX(typeManager: TypeManager, functionLookup: FunctionLookup, dataType: DataType, value: Value): Expression
    {
        return AppUtility.valueToExpression(typeManager, functionLookup, dataType, value);
    }

    public static valueToExpression(typeManager: TypeManager, functionLookup: FunctionLookup, dataType: DataType, value: Value): Expression
    {
        // PORT-NOTE: bug fix.  Java's asType(inner, expression) always gave the expression a list of
        // the type, which is right for an empty list, but for a tagged value (of a type with type
        // variables, such as Optional) gave it a type error.  Here it takes the whole type.
        const asType = (type: DataType, expression: Expression): CallExpression =>
        {
            return new CallExpression(functionLookup, AsType.NAME, new TypeLiteralExpression(TypeExpression.fromDataType(type)), expression);
        };

        return dataType.apply<Expression>({
            number(numberInfo: NumberInfo): Expression
            {
                return new NumericLiteral(Utility.cast(value, Decimal), numberInfo.getUnit().equals(Unit.SCALAR) ? null : UnitExpression.load(numberInfo.getUnit()));
            },

            text(): Expression
            {
                return new StringLiteral(Utility.cast(value, String));
            },

            date(dateTimeInfo: DateTimeInfo): Expression
            {
                return new TemporalLiteral(dateTimeInfo.getType(), DataTypeUtility.valueToString(value));
            },

            bool(): Expression
            {
                return new BooleanLiteral(Utility.cast(value, Boolean));
            },

            tagged(typeName: TypeId, typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Expression
            {
                const taggedValue = Utility.cast(value, TaggedValue);
                const tag = tags[taggedValue.getTagIndex()]!;
                const constructor = IdentExpression.tag(typeName.getRaw(), tag.getName());
                const innerValue = taggedValue.getInner();
                const innerType = tag.getInner();
                const expression = innerValue === null || innerType === null ? constructor : new CallExpression(constructor, [AppUtility.valueToExpression(typeManager, functionLookup, innerType, innerValue)]);
                if (typeVars.length === 0)
                    return expression;
                else
                {
                    const lookedUp = typeManager.lookupType(typeName, typeVars);
                    if (lookedUp === null)
                        throw new UserException("Could not find type: " + dataType.toString());
                    return asType(lookedUp, expression);
                }
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): Expression
            {
                const record = Utility.cast(value, Record);
                const members: Pair<ExpressionIdentifier, Expression>[] = [];
                for (const [fieldName, fieldType] of fields)
                {
                    members.push(new Pair(fieldName, AppUtility.valueToExpression(typeManager, functionLookup, fieldType, record.getField(fieldName))));
                }
                return new RecordExpression(members);
            },

            array(inner: DataType): Expression
            {
                const listEx = Utility.cast(value, ListEx);
                const size = listEx.size();
                const members: Expression[] = [];

                for (let i = 0; i < size; i++)
                {
                    members.push(AppUtility.valueToExpression(typeManager, functionLookup, inner, listEx.get(i)));
                }

                if (size === 0)
                    return asType(DataType.array(inner), new ArrayExpression(members));
                else
                    return new ArrayExpression(members);
            },
        });
    }
}
