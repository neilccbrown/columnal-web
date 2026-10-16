// Port of test.gen.GenExpressionValueBase (tests-functions testFixtures).
import type { Expression } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FunctionList } from "../../../../../src/engine/functions/transformations/function/FunctionList.js";
import type { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../src/engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../../src/engine/utility-error/error/UserException.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../../support/quickcheck.js";
import type { DummyManager } from "../DummyManager.js";
import { TFunctionUtil } from "../functions/TFunctionUtil.js";
import type { ExpressionValue } from "./ExpressionValue.js";
import { GenValueBaseE } from "./GenValueBaseE.js";

export abstract class GenExpressionValueBase extends GenValueBaseE<ExpressionValue>
{
    // Java: an IdentityHashMap (a JS Map compares keys by identity)
    private readonly expressionValues = new Map<Expression, Pair<DataType, Value>>();
    protected dummyManager!: DummyManager;
    private distinctTypes!: readonly DataType[];

    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): ExpressionValue
    {
        this.r = r;
        this.gs = generationStatus;
        const p = TFunctionUtil.managerWithTestTypes();
        this.dummyManager = p.getFirst();
        this.distinctTypes = p.getSecond();
        this.expressionValues.clear();
        return this.generateValue();
    }

    // Java: makeType(r) here, and makeType() in GenExpressionValueBackwards, which passes its r
    public makeType(r: SourceOfRandomness = this.r): DataType
    {
        return r.choose(this.distinctTypes);
    }

    // Java: protected abstract ExpressionValue generate()
    protected abstract generateValue(): ExpressionValue;

    public register(expression: Expression, dataType: DataType, value: Value): Expression
    {
        this.expressionValues.set(expression, new Pair<DataType, Value>(dataType, value));
        return expression;
    }

    public override doShrink(_random: SourceOfRandomness, larger: ExpressionValue): ExpressionValue[]
    {
        // Java: canShrink(larger), which checks this:
        if (larger.generator !== this)
            return [];
        return [...this.expressionValues].flatMap(([key, value]) => {
            const replacement = this.makeLiteral(value.getFirst(), value.getSecond());
            if (replacement === null)
                return [];
            const after = larger.expression.replaceSubExpression(key, replacement);
            if (after.equals(larger.expression))
                return []; // No longer within
            return [larger.withExpression(after)];
        });
    }

    private makeLiteral(dataType: DataType, object: Value): Expression | null
    {
        try
        {
            return TFunctionUtil.parseExpression(DataTypeUtility.valueToString(object, dataType, false, null), this.dummyManager.getTypeManager(), FunctionList.getFunctionLookup(this.dummyManager.getUnitManager()));
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            return null;
        }
    }
}
