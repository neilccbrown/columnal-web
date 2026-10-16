// Port of xyz.columnal.transformations.expression.TypeLiteralExpression (expressions module).
import { javaEquals, javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { TagType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { JellyType } from "../../../types/jellytype/JellyTypes.js";
import { TypeExp } from "../../../types/typeExp/TypeExps.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { Log } from "../../../utility/log/Log.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { CallExpression, type Expression, IdentExpression, NonOperatorExpression } from "./Expressions.js";
import type { FunctionLookup } from "./function/FunctionLookup.js";
import { InvalidIdentTypeExpression, TypeExpression } from "./type/TypeExpressions.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";

/**
 * A type{...} expression.
 */
export class TypeLiteralExpression extends NonOperatorExpression
{
    // This may a type expression that doesn't save to a valid type:
    private readonly type: TypeExpression;

    public constructor(type: TypeExpression)
    {
        super();
        this.type = type;
    }

    // Java: fixType(TypeManager, FunctionLookup, JellyType fix, Expression) and fixType(FunctionLookup, TypeExpression fixTo, Expression)
    public static fixType(typeManager: TypeManager, functionLookup: FunctionLookup, fix: JellyType, expression: Expression): Expression;
    public static fixType(functionLookup: FunctionLookup, fixTo: TypeExpression, expression: Expression): Expression;
    public static fixType(...args: unknown[]): Expression
    {
        if (args.length === 4)
        {
            const [typeManager, functionLookup, fix, expression] = args as [TypeManager, FunctionLookup, JellyType, Expression];
            try
            {
                return TypeLiteralExpression.fixTypeTo(functionLookup, TypeExpression.fromJellyType(fix, typeManager), expression);
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                // If we have a user exception, we are trying to fix to a non-existent type.
                // Probably means we fucked up, but just use blank type:
                Log.log(e);
                return TypeLiteralExpression.fixTypeTo(functionLookup, new InvalidIdentTypeExpression(""), expression);
            }
        }
        const [functionLookup, fixTo, expression] = args as [FunctionLookup, TypeExpression, Expression];
        return TypeLiteralExpression.fixTypeTo(functionLookup, fixTo, expression);
    }

    private static fixTypeTo(functionLookup: FunctionLookup, fixTo: TypeExpression, expression: Expression): Expression
    {
        // Special case -- if it's "from text", switch to "from text to":
        if (expression instanceof CallExpression)
        {
            const call = expression;
            const callFunction = call.getFunction();
            if (callFunction instanceof IdentExpression)
            {
                const func = callFunction;
                if (javaEquals(func.getFunctionDefinition(), functionLookup.lookup("from text")))
                {
                    const fromTextTo = functionLookup.lookup("from text to");
                    if (fromTextTo !== null)
                    {
                        return new CallExpression(IdentExpression.function(fromTextTo.getFullName()), [new TypeLiteralExpression(fixTo),
                            call.getParams()[0]!]);
                    }
                }
            }
        }

        const asType = functionLookup.lookup( "as type");
        if (asType === null)
            throw new InternalException("Missing as type function");
        if (expression instanceof CallExpression
            && expression.getFunction() instanceof  IdentExpression &&
                javaEquals((expression.getFunction() as IdentExpression).getFunctionDefinition(), asType)
            )
        {
            expression = expression.getParams()[1]!;
        }

        return new CallExpression(IdentExpression.function(asType.getFullName()), [
            new TypeLiteralExpression(fixTo),
            expression,
        ]);
    }

    public override check(_dataLookup: Expression.ColumnLookup, typeState: TypeState, _kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const dataType = this.type.toDataType(typeState.getTypeManager());
        if (dataType === null)
        {
            // Error should already have been given in the editor check
            //onError.recordError(this, StyledString.concat(StyledString.s("Invalid type: "), type.toStyledString()));
            return null;
        }
        return onError.recordTypeAndError(this, Either.right(TypeExp.dataTypeToTypeGADT(this, dataType)), typeState);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        // TODO return the actual type literal once we define the GADT
        return this.result(new TaggedValue(0, null, DataTypeUtility.fromTags([new TagType<unknown>("Type", null)])), state);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        return "type{" + this.type.save(saveDestination, renames) + "}";
    }

    public override toDisplay(_displayType: Expression.DisplayType, _surround: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.concat(StyledString.s("type{"), this.type.toStyledString(), StyledString.s("}")), this);
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        // TODO
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        // TODO
        return null;
    }


    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TypeLiteralExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return javaEquals(this.type, that.type);
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.type);
    }

    public getType(): TypeExpression
    {
        return this.type;
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.litType(this, this.type);
    }
}
