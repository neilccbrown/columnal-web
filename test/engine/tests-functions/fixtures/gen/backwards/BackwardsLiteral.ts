// Port of test.gen.backwards.BackwardsLiteral (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import { ArrayExpression, BooleanLiteral, NumericLiteral, RecordExpression, TemporalLiteral, TimesExpression, type Expression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ONE, type Decimal } from "../../../../../../src/engine/java/JavaBigDecimal.js";
import { javaShuffle } from "../../../../../../src/engine/java/JavaCollections.js";
import { JavaRandom } from "../../../../../../src/engine/java/JavaRandom.js";
import type { TemporalAccessor } from "../../../../../../src/engine/java/time/TemporalAccessor.js";
import type { DataType, DataTypeVisitor, TagType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import type { DateTimeInfo } from "../../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../../../src/engine/types/data/datatype/NumberInfo.js";
import type { TypeId } from "../../../../../../src/engine/types/data/datatype/TypeId.js";
import type { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import type { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../../../src/engine/utility-error/error/InternalException.js";
import type { TaggedValue } from "../../../../../../src/engine/utility/utility/TaggedValue.js";
import { Record, Utility, type ListEx } from "../../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { TFunctionUtil } from "../../functions/TFunctionUtil.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

export class BackwardsLiteral extends BackwardsProvider
{
    public override terminals(targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        const parent = this.parent;
        const r = this.r;
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        return targetType.apply<ExpressionMaker[]>(new class implements DataTypeVisitor<ExpressionMaker[]>
        {
            public number(numberInfo: NumberInfo): ExpressionMaker[]
            {
                return [
                    () => new NumericLiteral(targetValue as Decimal, parent.makeUnitExpression(numberInfo.getUnit())),
                        () => new TimesExpression([new NumericLiteral(targetValue as Decimal, null), new NumericLiteral(ONE, parent.makeUnitExpression(numberInfo.getUnit()))]),
                ];
            }

            public text(): ExpressionMaker[]
            {
                return [() => TFunctionUtil.makeStringLiteral(targetValue as string, r)];
            }

            public date(dateTimeInfo: DateTimeInfo): ExpressionMaker[]
            {
                return [
                    () => {
                        return new TemporalLiteral(dateTimeInfo.getType(), dateTimeInfo.getStrictFormatter().format(targetValue as TemporalAccessor));
                    },
                ];
            }

            public bool(): ExpressionMaker[]
            {
                return [() => new BooleanLiteral(targetValue as boolean)];
            }

            public tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): ExpressionMaker[]
            {
                return [() => {
                    const taggedValue = targetValue as TaggedValue;
                    const tag = tags[taggedValue.getTagIndex()]!;

                    const typeDefinition = parent.getTypeManager().lookupDefinition(typeName);
                    if (typeDefinition === null)
                        throw new InternalException("Looked up type but null definition: " + typeName.toString());
                    const tagInfo = typeDefinition._test_getTagInfos()[taggedValue.getTagIndex()]!;
                    const inner = tag.getInner();
                    const innerValue = taggedValue.getInner();
                    if (inner === null || innerValue === null)
                        return TFunctionUtil.tagged(parent.getTypeManager().getUnitManager(), tagInfo, null, targetType, true);
                    else
                        return TFunctionUtil.tagged(parent.getTypeManager().getUnitManager(), tagInfo, r.choose(outer.terminals(inner, innerValue))(), targetType, true);
                }];
            }

            public record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): ExpressionMaker[]
            {
                const record = Utility.cast(targetValue, Record);
                return [() => {
                    const members: Pair<ExpressionIdentifier, Expression>[] = [];
                    for (const [key, value] of fields)
                    {
                        const terminals = outer.terminals(value, record.getField(key));
                        members.push(new Pair(key, terminals[r.nextInt(terminals.length)]!()));
                    }
                    javaShuffle(members, new JavaRandom(r.nextLong()));
                    return new RecordExpression(members);
                }];
            }

            public array(inner: DataType): ExpressionMaker[]
            {
                return [() => {
                    const list = targetValue as ListEx;
                    const exps: Expression[] = [];
                    for (let i = 0; i < list.size(); i++)
                    {
                        exps.push(r.choose(outer.terminals(inner, list.get(i)))());
                    }
                    return new ArrayExpression(exps);
                }];
            }
        }());
    }

    // Structural semi-literals: structural outer layer, then recurse for inner item.
    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        const parent = this.parent;
        const r = this.r;
        return targetType.apply<ExpressionMaker[]>(new class implements DataTypeVisitor<ExpressionMaker[]>
        {
            public number(_numberInfo: NumberInfo): ExpressionMaker[]
            {
                return [];
            }

            public text(): ExpressionMaker[]
            {
                return [];
            }

            public date(_dateTimeInfo: DateTimeInfo): ExpressionMaker[]
            {
                return [];
            }

            public bool(): ExpressionMaker[]
            {
                return [];
            }

            public tagged(typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): ExpressionMaker[]
            {
                return [() => {
                    const taggedValue = targetValue as TaggedValue;
                    const tag = tags[taggedValue.getTagIndex()]!;

                    const typeDefinition = parent.getTypeManager().lookupDefinition(typeName);
                    if (typeDefinition === null)
                        throw new InternalException("Looked up type but null definition: " + typeName.toString());
                    const tagInfo = typeDefinition._test_getTagInfos()[taggedValue.getTagIndex()]!;
                    const inner = tag.getInner();
                    const innerValue = taggedValue.getInner();
                    if (inner === null || innerValue === null)
                        return TFunctionUtil.tagged(parent.getTypeManager().getUnitManager(), tagInfo, null, targetType, true);
                    else
                        return TFunctionUtil.tagged(parent.getTypeManager().getUnitManager(), tagInfo, parent.make(inner, innerValue, maxLevels - 1), targetType, true);
                }];
            }

            public record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): ExpressionMaker[]
            {
                const record = Utility.cast(targetValue, Record);
                return [() => {
                    const members: Pair<ExpressionIdentifier, Expression>[] = [];
                    for (const [key, value] of fields)
                    {
                        members.push(new Pair(key, parent.make(value, record.getField(key), maxLevels - 1)));
                    }
                    javaShuffle(members, new JavaRandom(r.nextLong()));
                    return new RecordExpression(members);
                }];
            }

            public array(inner: DataType): ExpressionMaker[]
            {
                return [() => {
                    const list = targetValue as ListEx;
                    const exps: Expression[] = [];
                    for (let i = 0; i < list.size(); i++)
                    {
                        exps.push(parent.make(inner, list.get(i), maxLevels - 1));
                    }
                    return new ArrayExpression(exps);
                }];
            }
        }());

    }
}
