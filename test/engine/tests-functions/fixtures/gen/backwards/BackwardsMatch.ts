// Port of test.gen.backwards.BackwardsMatch (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import { CanonicalSpan } from "../../../../../../src/engine/expressions/transformations/expression/CanonicalSpan.js";
import { AddSubtractExpression, AndExpression, ArrayExpression, BooleanLiteral, CallExpression, DefineExpression, EqualExpression, HasTypeExpression, IdentExpression, IfThenElseExpression, MatchAnythingExpression, MatchExpression, NumericLiteral, RecordExpression, TimesExpression, TypeLiteralExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { TypeExpression } from "../../../../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { FunctionList } from "../../../../../../src/engine/functions/transformations/function/FunctionList.js";
import { Decimal, ONE } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import { javaShuffle } from "../../../../../../src/engine/java/JavaCollections.js";
import { JavaRandom } from "../../../../../../src/engine/java/JavaRandom.js";
import { DataType, SpecificDataTypeVisitor, type DataTypeVisitor, type TagType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { DateTimeInfo } from "../../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../../../src/engine/types/data/datatype/TypeId.js";
import { TypeManager } from "../../../../../../src/engine/types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../../src/engine/utility-error/error/InternalException.js";
import type { TaggedValue } from "../../../../../../src/engine/utility/utility/TaggedValue.js";
import { ListEx, Record, Utility } from "../../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { TFunctionUtil } from "../../functions/TFunctionUtil.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import { ExpressionMaker } from "./ExpressionMaker.js";

class VarInfo
{
    public readonly name: ExpressionIdentifier;
    public readonly type: DataType;
    public readonly value: Value;

    public constructor(name: ExpressionIdentifier, type: DataType, value: Value)
    {
        this.name = name;
        this.type = type;
        this.value = value;
    }
}

class PatternInfo
{
    public readonly pattern: Expression;
    public readonly guard: Expression | null;

    public constructor(pattern: Expression, guard: Expression | null)
    {
        this.pattern = pattern;
        this.guard = guard;
    }

    public toPattern(): MatchExpression.Pattern
    {
        return new MatchExpression.Pattern(this.pattern, this.guard);
    }

    public toEquals(matchAgainst: Expression): Expression
    {
        const equalExpression = new EqualExpression([matchAgainst, this.pattern], true);
        return this.guard === null ? equalExpression : new AndExpression(
            [equalExpression, this.guard]
        );
    }
}

export class BackwardsMatch extends BackwardsProvider
{
    private nextVar = 0;
    private readonly varContexts: VarInfo[][] = [];

    private findVarOfType(typePred: (t: DataType) => boolean): VarInfo | null
    {
        const possibles: VarInfo[] = [];
        for (const varContext of this.varContexts)
        {
            for (const varInfo of varContext)
            {
                if (typePred(varInfo.type))
                {
                    possibles.push(varInfo);
                }
            }
        }
        return possibles.length === 0 ? null : this.r.choose(possibles);
    }

    public override terminals(targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        // For temporal, numerical, boolean and text, we manipulate them to be what we want.
        // For boolean, we may use an equals expression.
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        const parent = this.parent;

        return targetType.apply<ExpressionMaker[]>(new class implements DataTypeVisitor<ExpressionMaker[]>
        {
            public number(numberInfo: NumberInfo): ExpressionMaker[]
            {
                const numVar = outer.findVarOfType(t => DataTypeUtility.isNumber(t));
                if (numVar === null)
                    return [];
                const numVarFinal = numVar;
                const varRef = IdentExpression.load(numVar.name);
                return [() => {
                    return new AddSubtractExpression([
                        new TimesExpression([varRef, new NumericLiteral(ONE, parent.makeUnitExpression(numberInfo.getUnit().divideBy(TFunctionUtil.getUnit(numVarFinal.type))))]),
                            new NumericLiteral(Utility.addSubtractNumbers(targetValue as Decimal, Utility.cast(numVarFinal.value, Decimal), false), parent.makeUnitExpression(numberInfo.getUnit())),
                    ], [AddSubtractExpression.AddSubtractOp.ADD]);
                }];
            }

            public text(): ExpressionMaker[]
            {
                // TODO include text replace
                return [];
            }

            public date(_dateTimeInfo: DateTimeInfo): ExpressionMaker[]
            {
                // TODO include date manipulation
                return [];
            }

            public bool(): ExpressionMaker[]
            {
                const boolVar = outer.findVarOfType(t => t.equals(DataType.BOOLEAN));
                if (boolVar === null)
                    return [];
                else
                {
                    const name = boolVar.name;
                    // need to negate the value if it doesn't match:
                    if (boolVar.value === targetValue)
                        return [() => IdentExpression.load(name)];
                    else
                    {
                        return [() => new CallExpression(FunctionList.getFunctionLookup(parent.getTypeManager().getUnitManager()), "not", IdentExpression.load(name)),
                            () => new EqualExpression([new BooleanLiteral(false), IdentExpression.load(name)], false),
                        ];
                    }
                }
            }

            public tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): ExpressionMaker[]
            {
                return [];
            }

            public record(_fields: ReadonlyMap<ExpressionIdentifier, DataType>): ExpressionMaker[]
            {
                return [];
            }

            public array(_inner: DataType): ExpressionMaker[]
            {
                return [];
            }
        }()).map(m => ExpressionMaker.withBias(m, 10));
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        return [
            () => this.makeMatch(maxLevels, targetType, targetValue),
            () => this.makeMatchIf(maxLevels, targetType, targetValue),
            () => this.makeMatchDefine(maxLevels, targetType, targetValue),
        ];
    }

    /**
     * Make a match expression with an if-then-else.
     *
     * @return An IfThenElseExpression that evaluates to the correct outcome.
     */
    private makeMatchIf(maxLevels: number, targetType: DataType, targetValue: Value): IfThenElseExpression
    {
        const t = this.parent.makeType();
        const actual = this.parent.makeValue(t);
        // Make a bunch of guards which won't fire:
        const clauses: Pair<PatternInfo, Expression>[] = Utility.filterOptional(TBasicUtil.makeList(this.r, 0, 4, () => {
            const nonMatch = this.makeNonMatchingPattern(maxLevels - 1, t, actual);
            return nonMatch === null ? null : new Pair<PatternInfo, Expression>(nonMatch,
                    this.parent.make(targetType, this.parent.makeValue(targetType), maxLevels - 1));
        }));

        // Add var context for successful pattern:
        this.varContexts.push([]);
        const match = this.makePatternMatch(maxLevels - 1, t, actual, true);
        const correctOutcome = this.parent.make(targetType, targetValue, maxLevels - 1);
        let guard: Expression | null = this.r.nextBoolean() ? null : this.parent.make(DataType.BOOLEAN, true, maxLevels - 1);
        const extraGuard = match.guard;
        if (extraGuard !== null)
            guard = (guard === null ? extraGuard : new AndExpression([extraGuard, guard]));
        const successful = new PatternInfo(match.pattern, guard);
        clauses.splice(this.r.nextInt(0, clauses.length), 0, new Pair<PatternInfo, Expression>(successful, correctOutcome));
        // Remove for successful pattern:
        this.varContexts.pop();

        const toMatch = this.parent.make(t, actual, maxLevels - 1);
        let cur = IfThenElseExpression.unrecorded(clauses[0]!.getFirst().toEquals(toMatch), clauses[0]!.getSecond(), this.parent.make(targetType, this.parent.makeValue(targetType), maxLevels - 1));

        for (let i = 1; i < clauses.length; i++)
        {
            cur = IfThenElseExpression.unrecorded(clauses[i]!.getFirst().toEquals(toMatch), clauses[i]!.getSecond(), cur);
        }

        return cur;
    }

    /**
     * Make a define expression.
     *
     * @return A DefineExpression that evaluates to the correct outcome.
     */
    private makeMatchDefine(maxLevels: number, targetType: DataType, targetValue: Value): Expression
    {
        const t = this.parent.makeType();
        const actual = this.parent.makeValue(t);

        // Add var context for successful pattern:
        this.varContexts.push([]);
        const match = this.makePatternMatch(maxLevels - 1, t, actual, true);
        const correctOutcome = this.parent.make(targetType, targetValue, maxLevels - 1);
        let guard = this.parent.make(DataType.BOOLEAN, true, maxLevels - 1);
        const extraGuard = match.guard;
        if (extraGuard !== null)
            guard = new AndExpression([extraGuard, guard]);

        // Remove for successful pattern:
        const declVars = this.varContexts.pop()!;

        const toMatch = this.parent.make(t, actual, maxLevels - 1);

        const defines: Either<HasTypeExpression, DefineExpression.Definition>[] = [];
        if (declVars.length !== 0)
        {
            const v = declVars[this.r.nextInt(declVars.length)]!;
            defines.push(Either.left(new HasTypeExpression(v.name, new TypeLiteralExpression(TypeExpression.fromDataType(v.type)))));
            defines.push(Either.right(new DefineExpression.Definition(match.pattern, toMatch)));
            return DefineExpression.unrecorded(defines, IfThenElseExpression.unrecorded(guard, correctOutcome, this.parent.make(targetType, this.parent.makeValue(targetType), maxLevels - 1)));
        }
        else
        {
            // If no vars, it's fine to just return the outcome:
            return correctOutcome;
        }
    }


    /**
     * Make a match expression with a match.
     *
     * @return A MatchExpression that evaluates to the correct outcome.
     */
    private makeMatch(maxLevels: number, targetType: DataType, targetValue: Value): MatchExpression
    {
        const t = this.parent.makeType();
        const actual = this.parent.makeValue(t);
        // Make a bunch of guards which won't fire:
        const clauses: MatchExpression.MatchClause[] = Utility.filterOptional(TBasicUtil.makeList(this.r, 0, 4, () => {
            // Generate a bunch which can't match the item:
            const patterns = this.makeNonMatchingPatterns(maxLevels - 1, t, actual);
            const outcome = this.parent.make(targetType, this.parent.makeValue(targetType), maxLevels - 1);
            if (patterns.length === 0)
                return null;
            return MatchExpression.MatchClause.unrecorded(Utility.mapListExI(patterns, (p: PatternInfo) => p.toPattern()), outcome);
        }));
        const patterns: PatternInfo[] = [...this.makeNonMatchingPatterns(maxLevels - 1, t, actual)];

        const toMatch = this.parent.make(targetType, targetValue, maxLevels - 1);

        // Add var context for successful pattern:
        this.varContexts.push([]);
        const match = this.makePatternMatch(maxLevels - 1, t, actual, true);

        let guard: Expression | null = this.r.nextBoolean() ? null : this.parent.make(DataType.BOOLEAN, true, maxLevels - 1);
        const extraGuard = match.guard;
        if (extraGuard !== null)
            guard = (guard === null ? extraGuard : new AndExpression([extraGuard, guard]));
        const successful = new PatternInfo(match.pattern, guard);
        patterns.splice(this.r.nextInt(0, patterns.length), 0, successful);
        // Remove for successful pattern:
        this.varContexts.pop();
        clauses.splice(this.r.nextInt(0, clauses.length), 0, MatchExpression.MatchClause.unrecorded(Utility.mapListExI(patterns, (p: PatternInfo) => p.toPattern()), toMatch));
        return new MatchExpression(new CanonicalSpan(0, 0), this.parent.make(t, actual, maxLevels - 1), clauses, new CanonicalSpan(0, 0));
    }

    // Pattern and an optional guard
    private makePatternMatch(maxLevels: number, t: DataType, actual: Value, canMatchMore: boolean): PatternInfo
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        const parent = this.parent;
        const r = this.r;
        return t.apply<PatternInfo>(new class implements DataTypeVisitor<PatternInfo>
        {
            public number(_numberInfo: NumberInfo): PatternInfo
            {
                return this.general();
            }

            public text(): PatternInfo
            {
                return this.general();
            }

            public date(_dateTimeInfo: DateTimeInfo): PatternInfo
            {
                return this.general();
            }

            public bool(): PatternInfo
            {
                return this.general();
            }

            public tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], _tags: readonly TagType<DataType>[]): PatternInfo
            {
                if (r.nextBoolean())
                {
                    const p = actual as TaggedValue;
                    return t.apply(new class extends SpecificDataTypeVisitor<PatternInfo>
                    {
                        public override tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[]): PatternInfo
                        {
                            const tagType = tagTypes[p.getTagIndex()]!;
                            const inner = tagType.getInner();
                            const typeDefinition = parent.getTypeManager().lookupDefinition(typeName);
                            if (typeDefinition === null)
                                throw new InternalException("Looked up type but null definition: " + typeName.toString());
                            if (inner === null)
                                return new PatternInfo(TFunctionUtil.tagged(parent.getTypeManager().getUnitManager(), new TypeManager.TagInfo(typeDefinition, p.getTagIndex()), null, t, false), null);
                            const innerValue = p.getInner();
                            if (innerValue === null)
                                throw new InternalException("Type says inner value but is null");
                            const subPattern = outer.makePatternMatch(maxLevels, inner, innerValue, canMatchMore);
                            return new PatternInfo(TFunctionUtil.tagged(parent.getTypeManager().getUnitManager(), new TypeManager.TagInfo(typeDefinition, p.getTagIndex()), subPattern.pattern, t, false), subPattern.guard);
                        }
                    }());
                }
                else
                    return this.general();
            }

            public record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): PatternInfo
            {
                if (r.nextBoolean())
                {
                    const members: Pair<ExpressionIdentifier, Expression>[] = [];
                    const guards: Expression[] = [];
                    const values = Utility.cast(actual, Record);
                    // Note -- important to shuffle here not later, because we may capture a variable then use it later@
                    const entries: [ExpressionIdentifier, DataType][] = [...fields];
                    javaShuffle(entries, new JavaRandom(r.nextLong()));
                    for (const [key, dataType] of entries)
                    {
                        // We don't have to match every item:
                        if (canMatchMore && members.length >= 1 && r.nextInt(3) === 1)
                            continue;

                        const p = outer.makePatternMatch(maxLevels - 1, dataType, values.getField(key), canMatchMore);
                        members.push(new Pair(key, p.pattern));
                        if (p.guard !== null)
                            guards.push(p.guard);
                    }
                    const g = guards;
                    return new PatternInfo(new RecordExpression(members),
                        g.length === 0 ? null : (g.length === 1 ? g[0]! : new AndExpression(g))
                    );
                }
                else
                    return this.general();
            }

            public array(inner: DataType): PatternInfo
            {
                if (r.nextBoolean())
                {
                    const values = Utility.cast(actual, ListEx);
                    const members: Expression[] = [];
                    const guards: Expression[] = [];

                    for (let i = 0; i < values.size(); i++)
                    {
                        const p = outer.makePatternMatch(maxLevels - 1, inner, values.get(i), canMatchMore);
                        members.push(p.pattern);
                        if (p.guard !== null)
                            guards.push(p.guard);
                    }
                    const g = guards;
                    return new PatternInfo(new ArrayExpression(members),
                            g.length === 0 ? null : (g.length === 1 ? g[0]! : new AndExpression(g))
                    );
                }
                else
                    return this.general();

            }

            private general(): PatternInfo
            {
                const expression = parent.make(t, actual, maxLevels);

                if (r.nextBoolean()) // Do equals but using variable + guard
                {
                    const rhsVal = parent.make(t, actual, maxLevels);
                    const varName = ("var" + outer.nextVar++) as ExpressionIdentifier;
                    if (outer.varContexts.length !== 0)
                        outer.varContexts[outer.varContexts.length - 1]!.push(new VarInfo(varName, t, actual));
                    return new PatternInfo(IdentExpression.load(varName), new EqualExpression([IdentExpression.load(varName), rhsVal], false));
                }
                if (canMatchMore && r.nextInt(0, 5) === 1)
                    return new PatternInfo(new MatchAnythingExpression(), null);

                return new PatternInfo(expression, null);
            }
        }());
    }

    private makeNonMatchingPatterns(maxLevels: number, t: DataType, actual: Value): PatternInfo[]
    {
        return Utility.filterOptional(TBasicUtil.makeList(this.r, 1, 3, () => this.makeNonMatchingPattern(maxLevels, t, actual)));
    }

    private makeNonMatchingPattern(maxLevels: number, t: DataType, actual: Value): PatternInfo | null
    {
        let nonMatchingValue: Value;
        let attempts = 0;
        do
        {
            nonMatchingValue = this.parent.makeValue(t);
            if (attempts++ >= 30)
                return null;
        }
        while (Utility.compareValues(nonMatchingValue, actual) === 0);
        const nonMatchingValueFinal = nonMatchingValue;
        // Add var context for pattern:
        this.varContexts.push([]);
        const match = this.makePatternMatch(maxLevels - 1, t, nonMatchingValueFinal, false);

        let guard: Expression | null = this.r.nextBoolean() ? null : this.parent.make(DataType.BOOLEAN, true, maxLevels - 1);
        const extraGuard = match.guard;
        if (extraGuard !== null)
            guard = (guard === null ? extraGuard : new AndExpression([extraGuard, guard]));
        this.varContexts.pop();
        const guardFinal = guard;
        return new PatternInfo(match.pattern, guardFinal);
    }

}
