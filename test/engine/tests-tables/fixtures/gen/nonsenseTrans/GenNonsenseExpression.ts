// Port of test.gen.nonsenseTrans.GenNonsenseExpression (tests-tables testFixtures).
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import type { TableManager } from "../../../../../../src/engine/data/data/TableManager.js";
import { AddSubtractExpression, AndExpression, ArrayExpression, BooleanLiteral, CallExpression, ComparisonExpression, DivideExpression, EqualExpression, IdentExpression, InvalidIdentExpression, MatchExpression, NotEqualExpression, NumericLiteral, OrExpression, RaiseExpression, RecordExpression, TimesExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { CanonicalSpan } from "../../../../../../src/engine/expressions/transformations/expression/CanonicalSpan.js";
import { UnitExpression } from "../../../../../../src/engine/expressions/transformations/expression/UnitExpressions.js";
import { FunctionList } from "../../../../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../../../../src/engine/identifiers/id/ColumnId.js";
import { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { TaggedTypeDefinition } from "../../../../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import type { TypeManager } from "../../../../../../src/engine/types/data/datatype/TypeManager.js";
import { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../../../../src/engine/utility/utility/Utility.js";
import { EnumGenerator, Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenUnit } from "../../../../tests-basic/fixtures/gen/GenUnit.js";
import { DummyManager } from "../../../../tests-functions/fixtures/DummyManager.js";
import { TFunctionUtil } from "../../../../tests-functions/fixtures/functions/TFunctionUtil.js";

import ComparisonOperator = ComparisonExpression.ComparisonOperator;
import AddSubtractOp = AddSubtractExpression.AddSubtractOp;
import MatchClause = MatchExpression.MatchClause;

/**
 * Generates arbitrary expression which probably won't type check.
 * Useful for testing loading and saving of expressions.
 */
export class GenNonsenseExpression extends Generator<Expression>
{
    private readonly genUnit = new GenUnit();
    private tableManager: TableManager = DummyManager.make();
    // An identifier that is a column must be a column throughout, so we need to keep track:
    // Maps to true if column reference, false if not.
    private readonly columnReferences = new Map<string, boolean>();

    public setTableManager(tableManager: TableManager): void
    {
        this.tableManager = tableManager;
    }

    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): Expression
    {
        this.columnReferences.clear();
        return this.genDepth(true, sourceOfRandomness, 0, generationStatus);
    }

    // Java: genDepth(r, depth, gs) (tagAllowed true) and genDepth(tagAllowed, r, depth, gs)
    private genDepth(tagAllowed: boolean, r: SourceOfRandomness, depth: number, gs: GenerationStatus): Expression
    {
        // Make terminals more likely as we get further down:
        if (r.nextInt(0, 3 - depth) === 0)
        {
            // Terminal:
            return this.genTerminal(r, gs, false);
        }
        else
        {
            // Non-terminal:
            return r.choose<() => Expression>([
                () => new NotEqualExpression(this.genDepth(true, r, depth + 1, gs), this.genDepth(true, r, depth + 1, gs)),
                () => new EqualExpression(TBasicUtil.makeList(r, 2, 6, () => this.genDepth(true, r, depth + 1, gs)), false),
                () => {
                    const expressions = TBasicUtil.makeList(r, 2, 6, () => this.genDepth(true, r, depth + 1, gs));
                    const operators = r.nextBoolean() ? [ComparisonOperator.GREATER_THAN, ComparisonOperator.GREATER_THAN_OR_EQUAL_TO] : [ComparisonOperator.LESS_THAN, ComparisonOperator.LESS_THAN_OR_EQUAL_TO];
                    const comparisonOperatorGenerator = new class extends Generator<ComparisonOperator>
                    {
                        public override generate(random: SourceOfRandomness, _status: GenerationStatus): ComparisonOperator
                        {
                            return random.choose(operators);
                        }
                    }();
                    return new ComparisonExpression(expressions, TBasicUtil.makeList(expressions.length - 1, comparisonOperatorGenerator, r, gs));
                },
                () => new AndExpression(TBasicUtil.makeList(r, 2, 5, () => this.genDepth(true, r, depth + 1, gs))),
                () => new OrExpression(TBasicUtil.makeList(r, 2, 5, () => this.genDepth(true, r, depth + 1, gs))),
                () => new TimesExpression(TBasicUtil.makeList(r, 2, 5, () => this.genDepth(true, r, depth + 1, gs))),
                () => {
                    if (!tagAllowed)
                        return this.genTerminal(r, gs, false);
                    else
                    {
                        const tag = this.genTag(r);
                        return TFunctionUtil.tagged(this.tableManager.getUnitManager(), tag.getSecond(), this.genDepth(true, r, depth + 1, gs), tag.getFirst(), true);
                    }
                },
                () =>
                {
                    const expressions = TBasicUtil.makeList(r, 2, 6, () => this.genDepth(true, r, depth + 1, gs));
                    const opGenerator = new EnumGenerator<AddSubtractOp>([AddSubtractOp.ADD, AddSubtractOp.SUBTRACT]);
                    return new AddSubtractExpression(expressions, TBasicUtil.makeList(expressions.length - 1, opGenerator, r, gs));
                },
                () => new DivideExpression(this.genDepth(true, r, depth + 1, gs), this.genDepth(true, r, depth + 1, gs)),
                () => new RaiseExpression(this.genDepth(true, r, depth + 1, gs), this.genDepth(true, r, depth + 1, gs)),
                () => new CallExpression(this.genTerminal(r, gs, true), TBasicUtil.makeList(r, 1, 5, () => this.genDepth(true, r, depth + 1, gs))),
                () => new MatchExpression(new CanonicalSpan(0, 0), this.genDepth(false, r, depth + 1, gs), TBasicUtil.makeList(r, 1, 5, () => this.genClause(r, gs, depth + 1)), new CanonicalSpan(0, 0)),
                () => new ArrayExpression(TBasicUtil.makeList(r, 0, 6, () => this.genDepth(true, r, depth + 1, gs))),
                () => new RecordExpression(TBasicUtil.makeList(r, 2, 6, () => new Pair<ExpressionIdentifier, Expression>("x", this.genDepth(true, r, depth + 1, gs)))),
            ])();
        }
    }

    private genTerminal(r: SourceOfRandomness, gs: GenerationStatus, onlyCallTargets: boolean): Expression
    {
        // Call targets:
        const items: (() => Expression)[] = [
            () => {
                const tagInfo = this.genTag(r).getSecond();
                return IdentExpression.tag(tagInfo.getTypeName().getRaw(), tagInfo.getTagInfo().getName());
            },
            () => IdentExpression.function(r.choose(FunctionList.getAllFunctions(this.tableManager.getUnitManager())).getFullName()),
            () => {
                while (true)
                {
                    const ident = TBasicUtil.generateVarName(r);
                    if (this.columnReferences.get(ident) ?? false)
                    {
                        if (!onlyCallTargets)
                            return IdentExpression.column(new ColumnId(ident));
                    }
                    else
                    {
                        this.columnReferences.set(ident, false);
                        return IdentExpression.column(new ColumnId(ident));
                    }
                }
            },
        ];
        // Although unfinished is a valid call target, it doesn't survive a
        // round trip, so we put it below:

        if (!onlyCallTargets)
        {
            items.push(
                () => InvalidIdentExpression.identOrUnfinished(TFunctionUtil.makeUnfinished(r)),
                () => new NumericLiteral(Utility.parseNumber(r.nextBigInteger(160).toString()), r.nextBoolean() ? null : this.genUnitExpression(r, gs)),
                () => new BooleanLiteral(r.nextBoolean()),
                () => TFunctionUtil.makeStringLiteral(TBasicUtil.makeStringV(r, gs), r),
                () => {
                    const columnId = TBasicUtil.generateColumnId(r);
                    if (this.columnReferences.get(columnId.getRaw()) ?? true)
                    {
                        this.columnReferences.set(columnId.getRaw(), true);
                        return IdentExpression.column(columnId);
                    }
                    else
                    {
                        return IdentExpression.column(columnId);
                    }
                },
                () => {
                    return IdentExpression.table(TBasicUtil.generateTableId(r).getRaw());
                },
            );
        }

        return r.choose(items)();
    }

    private genTag(r: SourceOfRandomness): Pair<DataType, TypeManager.TagInfo>
    {
        const list: Pair<DataType, TypeManager.TagInfo>[] = [];
        for (const vs of this.tableManager.getTypeManager().getKnownTaggedTypes().values())
        {
            if (vs.getTaggedTypeName().getRaw() === "Type" || vs.getTaggedTypeName().getRaw() === "Unit")
                continue;

            for (const info of vs._test_getTagInfos())
            {
                const dataTypeTagInfoPair = new Pair(vs.instantiate(Utility.mapListI(vs.getTypeArguments(), p => p.getFirst() === TaggedTypeDefinition.TypeVariableKind.UNIT ? Either.left<Unit, DataType>(Unit.SCALAR) : Either.right<Unit, DataType>(DataType.TEXT)), this.tableManager.getTypeManager()), info);
                list.push(dataTypeTagInfoPair);
            }
        }
        return r.choose(list);
    }

    // Java: genUnit(r, gs)
    private genUnitExpression(r: SourceOfRandomness, gs: GenerationStatus): UnitExpression
    {
        // TODO generate richer expressions that cancel out, etc
        return UnitExpression.load(this.genUnit.generate(r, gs));
    }

    private genClause(r: SourceOfRandomness, gs: GenerationStatus, depth: number): MatchExpression.MatchClause
    {
        return MatchClause.unrecorded(TBasicUtil.makeList(r, 1, 4, () => this.genPattern(r, gs, depth)), this.genDepth(true, r, depth, gs));
    }

    private genPattern(r: SourceOfRandomness, gs: GenerationStatus, depth: number): MatchExpression.Pattern
    {
        return new MatchExpression.Pattern(this.genPatternMatch(r, gs, depth), r.nextBoolean() ? null : this.genDepth(true, r, depth, gs));
    }

    private genPatternMatch(r: SourceOfRandomness, gs: GenerationStatus, depth: number): Expression
    {
        return r.choose<() => Expression>([
            () => this.genDepth(false, r, depth, gs),
            () => {
                // Variable name for pattern match:
                while (true)
                {
                    const ident = TBasicUtil.generateVarName(r);
                    if (!(this.columnReferences.get(ident) ?? false))
                    {
                        this.columnReferences.set(ident, false);
                        return IdentExpression.column(new ColumnId(ident));
                    }
                }
            },
            () =>
            {
                const tag = this.genTag(r);
                return TFunctionUtil.tagged(this.tableManager.getUnitManager(), tag.getSecond(), r.nextInt(0, 3 - depth) === 0 ? null : this.genPatternMatch(r, gs, depth + 1), tag.getFirst(), true);
            },
        ])();
    }

    public override doShrink(_random: SourceOfRandomness, larger: Expression): Expression[]
    {
        return larger._test_childMutationPoints().map(p => p.getFirst());
    }
}
