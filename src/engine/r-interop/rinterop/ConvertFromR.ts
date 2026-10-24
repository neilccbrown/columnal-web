// Port of xyz.columnal.rinterop.ConvertFromR (r-interop module).
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import { ColumnUtility } from "../../data/data/ColumnUtility.js";
import type { EditableColumn } from "../../data/data/EditableColumn.js";
import { EditableRecordSet } from "../../data/data/EditableRecordSet.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import { HashMap } from "../../java/HashMap.js";
import { Decimal } from "../../java/JavaBigDecimal.js";
import { immutableMapBuilderPut, javaListGet } from "../../java/JavaCollections.js";
import { javaStringCompare } from "../../java/JavaObject.js";
import { javaReplace } from "../../java/JavaString.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DataType, FlatDataTypeVisitor, TagType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { TaggedTypeDefinition } from "../../types/data/datatype/TaggedTypeDefinition.js";
import type { TypeId } from "../../types/data/datatype/TypeId.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import type { JellyType } from "../../types/jellytype/JellyTypes.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { ListEx, Record, RecordMap, Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { DefaultRVisitor } from "./DefaultRVisitor.js";
import { RUtility } from "./RUtility.js";
import type { RValue } from "./RValue.js";
import type { RVisitor } from "./RVisitor.js";
import { SpecificRVisitor } from "./SpecificRVisitor.js";

type ValueFunction = SimulationFunction<Value, Value>;

/**
 * Represents the result of generalising two types
 * (labelled smaller and larger, although these are really just labels)
 * into a third result type, and gives the value transformations
 * needed for turning small/large into result.
 */
class GeneralisedTypePair
{
    public readonly resultingType: DataType;
    public readonly smallToResult: ValueFunction;
    public readonly largeToResult: ValueFunction;

    // Java has two constructors; the second (without largeToResult) is for when large is the identity transformation.
    public constructor(resultingType: DataType, smallToResult: ValueFunction, largeToResult: ValueFunction = x => x)
    {
        this.resultingType = resultingType;
        this.smallToResult = smallToResult;
        this.largeToResult = largeToResult;
    }
}

export class ConvertFromR
{
    private static getColumnName(listColumnNames: RValue | null, index: number): ColumnId
    {
        const def = IdentifierUtility.identNum("Column", index);
        if (listColumnNames !== null)
        {
            const s = RUtility.getString(RUtility.getListItem(listColumnNames, index));
            return new ColumnId(IdentifierUtility.fixExpressionIdentifier(s === null ? "" : s, def));
        }
        return new ColumnId(def);
    }

    /**
     * The returned type is the type of each list element (i.e. is not [necessarily] an array type).
     */
    public static convertRToTypedValueList(typeManager: TypeManager, rValue: RValue): Pair<DataType, readonly Value[]>
    {
        return rValue.visit(new class implements RVisitor<Pair<DataType, readonly Value[]>>
        {
            public visitNil(): Pair<DataType, readonly Value[]>
            {
                throw new UserException("Cannot turn nil into value");
            }

            public visitString(s: string | null, _isSymbol: boolean): Pair<DataType, readonly Value[]>
            {
                return this.visitStringList([s], null);
            }

            public visitLogicalList(values: readonly boolean[], isNA: readonly boolean[] | null, _attributes: RValue | null): Pair<DataType, readonly Value[]>
            {
                if (isNA === null)
                    return new Pair<DataType, readonly Value[]>(DataType.BOOLEAN, Utility.mapListI(values, b => b));

                const maybeValues: Value[] = [];
                for (let i = 0; i < values.length; i++)
                {
                    if (isNA[i])
                        maybeValues.push(typeManager.maybeMissing());
                    else
                        maybeValues.push(typeManager.maybePresent(values[i]!));
                }
                return new Pair<DataType, readonly Value[]>(typeManager.makeMaybeType(DataType.BOOLEAN), maybeValues);
            }

            public visitIntList(values: readonly number[], _attributes: RValue | null): Pair<DataType, readonly Value[]>
            {
                // int[] doesn't use NA; always doubles if has NA
                return new Pair<DataType, readonly Value[]>(DataType.NUMBER, Utility.mapListI(values, i => new Decimal(i)));
            }

            public visitDoubleList(values: readonly number[], _attributes: RValue | null): Pair<DataType, readonly Value[]>
            {
                let hasNaNs = false;
                for (let i = 0; i < values.length; i++)
                {
                    if (Number.isNaN(values[i]))
                    {
                        hasNaNs = true;
                        break;
                    }
                }
                if (hasNaNs)
                {
                    const maybeValues: Value[] = [];
                    for (let i = 0; i < values.length; i++)
                    {
                        if (Number.isNaN(values[i]))
                            maybeValues.push(typeManager.maybeMissing());
                        else
                            maybeValues.push(typeManager.maybePresent(RUtility.doubleToValue(values[i]!)));
                    }

                    return new Pair<DataType, readonly Value[]>(typeManager.makeMaybeType(DataType.NUMBER), maybeValues);
                }
                else
                {
                    return new Pair<DataType, readonly Value[]>(DataType.NUMBER, values.map(d => RUtility.doubleToValue(d)));
                }
            }

            public visitStringList(values: readonly (string | null)[], _attributes: RValue | null): Pair<DataType, readonly Value[]>
            {
                if (values.every(v => v !== null))
                {
                    return new Pair<DataType, readonly Value[]>(DataType.TEXT, Utility.mapListI(values, v => v!));
                }
                else
                {
                    return new Pair<DataType, readonly Value[]>(typeManager.makeMaybeType(DataType.TEXT), Utility.mapListI(values, v => v !== null ? typeManager.maybePresent(v) : typeManager.maybeMissing()));
                }
            }

            public visitTemporalList(dateTimeType: DateTimeInfo.DateTimeType, values: readonly (TemporalAccessor | null)[], _attributes: RValue | null): Pair<DataType, readonly Value[]>
            {
                const t = new DateTimeInfo(dateTimeType);
                if (values.every(v => v !== null))
                {
                    return new Pair<DataType, readonly Value[]>(DataType.date(t), Utility.mapListI(values, v => v!));
                }
                else
                {
                    return new Pair<DataType, readonly Value[]>(typeManager.makeMaybeType(DataType.date(t)), Utility.mapListI(values, v => v !== null ? typeManager.maybePresent(v) : typeManager.maybeMissing()));
                }
            }

            public visitGenericList(values: readonly RValue[], attributes: RValue | null, _isObject: boolean): Pair<DataType, readonly Value[]>
            {
                if (attributes !== null)
                {
                    const attrMap = RUtility.pairListToMap(attributes);
                    const namesRValue = attrMap.get("names") ?? null;
                    if (namesRValue !== null)
                    {
                        const names = namesRValue.visit(new class extends SpecificRVisitor<readonly (string | null)[]>
                        {
                            public override visitStringList(values: readonly (string | null)[], _attributes: RValue | null): readonly (string | null)[]
                            {
                                return values;
                            }
                        }());
                        if (names.length !== values.length)
                        {
                            throw new UserException("List has named values, but names not same length as items");
                        }

                        const paired: Pair<string, RValue>[] = [];
                        for (let i = 0; i < names.length; i++)
                        {
                            paired.push(new Pair<string, RValue>(names[i] ?? ("Unnamed field " + i), values[i]!));
                        }

                        const fieldTypesAndValue = ConvertFromR.record(typeManager, paired);
                        return new Pair<DataType, readonly Value[]>(fieldTypesAndValue.getFirst(), [fieldTypesAndValue.getSecond()]);
                    }
                }
                return ConvertFromR.rListToValueList(typeManager, values);
            }

            public visitPairList(items: readonly RVisitor.PairListEntry[]): Pair<DataType, readonly Value[]>
            {
                // For some reason, factor columns appear as pair list of two with an int[] as second item:
                if (items.length === 2)
                {
                    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
                    const outer: RVisitor<Pair<DataType, readonly Value[]>> = this;
                    const asFactors = items[0]!.item.visit(new class extends DefaultRVisitor<Pair<DataType, readonly Value[]> | null>
                    {
                        public override visitFactorList(values: readonly number[], levelNames: readonly string[]): Pair<DataType, readonly Value[]> | null
                        {
                            return outer.visitFactorList(values, levelNames);
                        }
                    }(null));
                    if (asFactors !== null)
                        return asFactors;
                }

                const pairs = Utility.mapListExI(items, e => {
                    let name: string | null = null;
                    if (e.tag !== null)
                    {
                        name = RUtility.getString(e.tag);
                    }
                    if (name === null)
                        name = "";
                    return new Pair<string, RValue>(name, e.item);
                });

                const record = ConvertFromR.record(typeManager, pairs);
                return new Pair<DataType, readonly Value[]>(record.getFirst(), [record.getSecond()]);
            }

            public visitFactorList(values: readonly number[], levelNames: readonly string[]): Pair<DataType, readonly Value[]>
            {
                let hasNAs = false;
                for (const value of values)
                {
                    if (value === RUtility.NA_AS_INTEGER)
                    {
                        hasNAs = true;
                        break;
                    }
                }

                const taggedTypeDefinition = ConvertFromR.getTaggedTypeForFactors(levelNames, typeManager);
                const factorValues: Value[] = [];
                for (const n of values)
                {
                    if (hasNAs && n === RUtility.NA_AS_INTEGER)
                    {
                        factorValues.push(typeManager.maybeMissing());
                    }
                    else
                    {
                        const taggedValue = new TaggedValue(this.lookupTag(n, levelNames, taggedTypeDefinition), null, taggedTypeDefinition);
                        factorValues.push(hasNAs ? typeManager.maybePresent(taggedValue) : taggedValue);
                    }
                }

                const taggedDataType = taggedTypeDefinition.instantiate([], typeManager);
                return new Pair<DataType, readonly Value[]>(hasNAs ? typeManager.makeMaybeType(taggedDataType) : taggedDataType, factorValues);
            }

            private lookupTag(tagIndex: number, levelNames: readonly string[], taggedTypeDefinition: TaggedTypeDefinition): number
            {
                if (tagIndex > levelNames.length)
                    throw new UserException("Factor index does not have name");
                // Map one-based back to zero-based:
                const name = IdentifierUtility.fixExpressionIdentifier(javaListGet(levelNames, tagIndex - 1), javaListGet(levelNames, tagIndex - 1) as ExpressionIdentifier);
                const index = Utility.findFirstIndex(taggedTypeDefinition.getTags(), tt => tt.getName() === name);
                if (index === null)
                    throw new UserException("Could not find tag named " + name + " in definition");
                return index;
            }
        }());
    }

    // PORT-NOTE: bug fix.  Java tried the same type name 100 times, so if a type with that name
    // but different tags already existed, the import failed.  Later tries add a number.
    private static getTaggedTypeForFactors(levelNames: readonly string[], typeManager: TypeManager): TaggedTypeDefinition
    {
        const processedNames = levelNames.map((s, i) => IdentifierUtility.fixExpressionIdentifier(s, IdentifierUtility.identNum("Factor", i)));

        const namesAsSet = new Set(processedNames);
        const existing = [...typeManager.getKnownTaggedTypes().values()].find(ttd =>
        {
            const tagNames = new Set(ttd.getTags().map(tt => tt.getName()));
            return tagNames.size === namesAsSet.size && [...tagNames].every(n => namesAsSet.has(n));
        }) ?? null;
        if (existing !== null)
            return existing;

        for (let i = 0; i < 100; i++)
        {
            const hint: ExpressionIdentifier = "F " + i;
            const firstSorted = [...levelNames].sort(javaStringCompare)[0] ?? "F";
            const typeName = IdentifierUtility.fixExpressionIdentifier(firstSorted + " " + levelNames.length + (i === 0 ? "" : " " + i), hint);
            const taggedTypeDefinition = typeManager.registerTaggedType(typeName, [], levelNames.map(s => new TagType<JellyType>(IdentifierUtility.fixExpressionIdentifier(s, "Factor"), null)));
            if (taggedTypeDefinition !== null)
                return taggedTypeDefinition;
        }
        throw new UserException("Types for these factor levels already exist (up to 100) but with different tags");
    }

    public static convertRToColumn(typeManager: TypeManager, rValue: RValue, columnName: ColumnId): Pair<SimulationFunction<RecordSet, EditableColumn>, number>
    {
        const converted = ConvertFromR.convertRToTypedValueList(typeManager, rValue);
        return new Pair(ColumnUtility.makeImmediateColumn(converted.getFirst(), columnName, Utility.mapListI(converted.getSecond(), x => Either.right<string, Value>(x)), DataTypeUtility.makeDefaultValue(converted.getFirst())), converted.getSecond().length);
    }

    private static getOrInternal(map: HashMap<DataType, ValueFunction>, key: DataType): ValueFunction
    {
        const f = map.get(key) ?? null;
        if (f === null)
            throw new InternalException("No conversion found for type " + key.toString());
        return f;
    }

    // The DataType is the type of the list *elements*, not the list as a whole.
    // e.g. the return may be (Number, [1,2,3])
    private static rListToValueList(typeManager: TypeManager, values: readonly RValue[]): Pair<DataType, readonly Value[]>
    {
        // The type here will be the type of the object on the right
        const typedPairs = Utility.mapListExI(values, (v): Pair<DataType, Value> => {
            const r = ConvertFromR.convertRToTypedValueList(typeManager, v);
            if (r.getSecond().length === 1)
                return r.replaceSecond(r.getSecond()[0]!);
            else
                return new Pair<DataType, Value>(DataType.array(r.getFirst()), DataTypeUtility.value(r.getSecond()));
        });
        const m = ConvertFromR.generaliseType(typeManager, Utility.mapListExI(typedPairs, p => p.getFirst()));
        const loaded = Utility.mapListExI(typedPairs, p => ConvertFromR.getOrInternal(m.getSecond(), p.getFirst())(p.getSecond()));
        return new Pair<DataType, readonly Value[]>(m.getFirst(), loaded);
    }

    /**
     * Java has two overloads:
     *  - generaliseType(TypeManager, DataType smaller, DataType larger) (package-visible):
     *    if smaller can be generalised into larger (or some even larger type), returns the conversion function from small to large and the destination type.  If not (including case where larger can generalise to smaller), return null
     *  - generaliseType(TypeManager, ImmutableList<DataType> types) (private): see generaliseTypes below.
     */
    public static generaliseType(typeManager: TypeManager, smaller: DataType, larger: DataType): GeneralisedTypePair | null;
    public static generaliseType(typeManager: TypeManager, types: readonly DataType[]): Pair<DataType, HashMap<DataType, ValueFunction>>;
    public static generaliseType(typeManager: TypeManager, a: DataType | readonly DataType[], larger?: DataType): GeneralisedTypePair | null | Pair<DataType, HashMap<DataType, ValueFunction>>
    {
        if (Array.isArray(a))
            return ConvertFromR.generaliseTypes(typeManager, a as readonly DataType[]);
        const smaller = a as DataType;
        larger = larger!;
        if (smaller.equals(larger))
            return new GeneralisedTypePair(larger, x => x);
        if (larger.equals(typeManager.makeMaybeType(smaller)))
            return new GeneralisedTypePair(larger, x => typeManager.maybePresent(x));
        const largeInner = ConvertFromR.getArrayInner(larger);
        if (largeInner !== null)
        {
            if (largeInner.equals(smaller))
                return new GeneralisedTypePair(larger, x => DataTypeUtility.value([x]));
            else if (largeInner.equals(typeManager.makeMaybeType(smaller)))
                return new GeneralisedTypePair(larger, x => DataTypeUtility.value([typeManager.maybePresent(x)]));

            const smallInner = ConvertFromR.getArrayInner(smaller);
            const genInners = smallInner === null ? null : ConvertFromR.generaliseType(typeManager, smallInner, largeInner);
            if (genInners !== null)
            {
                return new GeneralisedTypePair(DataType.array(genInners.resultingType), ConvertFromR.applyToList(genInners.smallToResult), ConvertFromR.applyToList(genInners.largeToResult));
            }
        }
        const smallFields = ConvertFromR.getRecordFields(smaller);
        const largeFields = ConvertFromR.getRecordFields(larger);
        if (smallFields !== null && largeFields !== null)
        {
            // Generalisation is possible if all shared fields can be generalised pairwise, and all non-shared fields can be generalised into optional
            // PORT-NOTE: these are Java HashMaps, whose order decides the order of the record's fields.
            // true if large
            const nonShared = HashMap.javaOrder<ExpressionIdentifier, Pair<boolean, DataType>>();
            // small, large in pair:
            const shared = HashMap.javaOrder<ExpressionIdentifier, Pair<DataType, DataType>>();
            nonShared.setAll(Utility.mapValues(smallFields, t => new Pair(false, t)));
            for (const [lKey, lValue] of largeFields.entries())
            {
                const s = nonShared.get(lKey) ?? null;
                nonShared.delete(lKey);
                if (s === null)
                {
                    // Not in small; add it
                    nonShared.set(lKey, new Pair(true, lValue));
                }
                else
                {
                    // Move to shared:
                    shared.set(lKey, new Pair(s.getSecond(), lValue));
                }
            }
            // Now shared and nonShared are set-up, so get processing into result:
            const result = HashMap.javaOrder<ExpressionIdentifier, GeneralisedTypePair>();

            // Non-shared types need to be optional.
            // (We don't nest optionals)
            for (const [eKey, eValue] of nonShared.entries())
            {
                let r: GeneralisedTypePair;
                if (ConvertFromR.isOptional(eValue.getSecond()))
                {
                    r = new GeneralisedTypePair(eValue.getSecond(), x => x);
                }
                else
                {
                    const optType = typeManager.makeMaybeType(eValue.getSecond());
                    if (eValue.getFirst()) // Large
                        r = new GeneralisedTypePair(optType, x => x, x => typeManager.maybePresent(x));
                    else
                        r = new GeneralisedTypePair(optType, x => typeManager.maybePresent(x));
                }
                result.set(eKey, r);

            }

            for (const [eKey, eValue] of shared.entries())
            {
                const gen = ConvertFromR.generaliseType(typeManager, eValue.getFirst(), eValue.getSecond());
                if (gen === null)
                    return null;//throw new UserException("Cannot generalise shared field named " + e.getKey() + " types: " + e.getValue().getFirst() + " and " + e.getValue().getSecond() + " are incompatible");
                result.set(eKey, gen);
            }

            return new GeneralisedTypePair(DataType.record(Utility.mapValues(result, p => p.resultingType)), ConvertFromR.applyToRecord(typeManager, Utility.mapValues(result, p => p.smallToResult)), ConvertFromR.applyToRecord(typeManager, Utility.mapValues(result, p => p.largeToResult)));
        }


        return null;
    }

    private static isOptional(dataType: DataType): boolean
    {
        return dataType.apply(new class extends FlatDataTypeVisitor<boolean>
        {
            public override tagged(typeName: TypeId): boolean
            {
                return typeName.getRaw() === "Optional";
            }
        }(false));
    }

    private static applyToRecord(typeManager: TypeManager, applyToInner: Iterable<readonly [ExpressionIdentifier, ValueFunction]>): ValueFunction
    {
        return x => {
            const record = Utility.cast(x, Record);
            const r = new Map<ExpressionIdentifier, Value>();
            // PORT-NOTE: a Java HashMap, whose order decides the order of the record's fields.
            const stillToApply = HashMap.javaOrder<ExpressionIdentifier, ValueFunction>({}, applyToInner);
            for (const [entryKey, entryValue] of record.getFullContent().entries())
            {
                const f = stillToApply.get(entryKey) ?? null;
                stillToApply.delete(entryKey);
                if (f === null)
                    throw new InternalException("Problem fetching value for " + entryKey);
                immutableMapBuilderPut(r, entryKey, f(entryValue));
            }
            // Other fields must now be Optional, so insert None values:
            for (const key of stillToApply.keys())
            {
                immutableMapBuilderPut<ExpressionIdentifier, Value>(r, key, typeManager.maybeMissing());
            }
            return new RecordMap(r);
        };
    }

    private static applyToList(applyToInner: ValueFunction): ValueFunction
    {
        return x => {
            const list = Utility.cast(x, ListEx);
            const length = list.size();
            const processed: Value[] = [];
            for (let i = 0; i < length; i++)
            {
                processed.push(applyToInner(list.get(i)));
            }
            return DataTypeUtility.value(processed);
        };
    }

    private static getRecordFields(dataType: DataType): ReadonlyMap<ExpressionIdentifier, DataType> | null
    {
        return dataType.apply(new class extends FlatDataTypeVisitor<ReadonlyMap<ExpressionIdentifier, DataType> | null>
        {
            public override record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): ReadonlyMap<ExpressionIdentifier, DataType> | null
            {
                return fields;
            }
        }(null));
    }

    private static getArrayInner(dataType: DataType): DataType | null
    {
        return dataType.apply(new class extends FlatDataTypeVisitor<DataType | null>
        {
            public override array(inner: DataType): DataType | null
            {
                return inner;
            }
        }(null));
    }

    /**
     * The generalisations available here are x -> Optional(x), and x -> List(x), as well as List(x) -> List(Optional(x))
     * (Java: an overload of generaliseType)
     * @param typeManager
     * @param types
     * @return
     * @throws UserException
     * @throws InternalException
     */
    private static generaliseTypes(typeManager: TypeManager, types: readonly DataType[]): Pair<DataType, HashMap<DataType, ValueFunction>>
    {
        if (types.length === 0)
            return new Pair(DataType.TEXT, new HashMap<DataType, ValueFunction>());
        let curType = types[0]!;
        const conversions = new HashMap<DataType, ValueFunction>();
        conversions.set(curType, x => x);
        for (const nextType of types.slice(1))
        {
            if (conversions.has(nextType))
            {
                // Fine, already dealt with
                continue;
            }
            const curToNext = ConvertFromR.generaliseType(typeManager, curType, nextType);
            if (curToNext !== null)
            {
                conversions.set(curType, x => x);
                ConvertFromR.composeAllWith(conversions, curToNext.smallToResult);
                curType = curToNext.resultingType;
                conversions.set(nextType, curToNext.largeToResult);
                continue;
            }
            const nextToCur = ConvertFromR.generaliseType(typeManager, nextType, curType);
            if (nextToCur !== null)
            {
                ConvertFromR.composeAllWith(conversions, nextToCur.largeToResult);
                conversions.set(nextType, nextToCur.smallToResult);
                curType = nextToCur.resultingType;
                continue;
            }
            throw new UserException("Cannot generalise " + curType.toString() + " and " + nextType.toString() + " into a single type");
        }

        return new Pair(curType, new HashMap(conversions));
    }

    private static composeAllWith(current: HashMap<DataType, ValueFunction>, thenApply: ValueFunction): void
    {
        for (const [key, value] of [...current.entries()])
        {
            // Must take value outside lambda, since we're about to change it:
            const prev = value;
            current.set(key, x => thenApply(prev(x)));
        }
    }

    public static convertRToTable(typeManager: TypeManager, rValue: RValue, allowMultipleTables: boolean): Pair<string, EditableRecordSet>[]
    {
        // R tables are usually a list of columns, which suits us:
        return rValue.visit(new class implements RVisitor<Pair<string, EditableRecordSet>[]>
        {
            private singleColumn(): Pair<string, EditableRecordSet>[]
            {
                const p = ConvertFromR.convertRToColumn(typeManager, rValue, new ColumnId("Result"));
                return [new Pair("Value", new EditableRecordSet([p.getFirst()], () => p.getSecond()))];
            }

            private recordOrTable(fields: readonly Pair<string, RValue>[]): Pair<string, EditableRecordSet>[]
            {
                let rowCount = -1;

                const columns: SimulationFunction<RecordSet, EditableColumn>[] = [];
                for (let i = 0; i < fields.length; i++)
                {
                    const col = ConvertFromR.convertRToColumn(typeManager, fields[i]!.getSecond(), new ColumnId(IdentifierUtility.fixExpressionIdentifier(fields[i]!.getFirst(), IdentifierUtility.identNum("Column", i))));
                    if (rowCount !== -1 && col.getSecond() !== rowCount)
                    {
                        // Not all the same size, treat as record:
                        const recTypeVal = ConvertFromR.record(typeManager, fields);

                        return [new Pair<string, EditableRecordSet>("Value", new EditableRecordSet([ColumnUtility.makeImmediateColumn(recTypeVal.getFirst(), new ColumnId("Object"), [Either.right<string, Value>(recTypeVal.getSecond())], DataTypeUtility.makeDefaultValue(recTypeVal.getFirst()))], () => 1))];
                    }

                    rowCount = col.getSecond();
                    columns.push(col.getFirst());
                }

                const rowCountFinal = rowCount;
                return [new Pair("Value", new EditableRecordSet(columns, () => rowCountFinal))];
            }

            public visitNil(): Pair<string, EditableRecordSet>[]
            {
                return [];
            }

            public visitString(_s: string | null, _isSymbol: boolean): Pair<string, EditableRecordSet>[]
            {
                return this.singleColumn();
            }

            public visitStringList(_values: readonly (string | null)[], _attributes: RValue | null): Pair<string, EditableRecordSet>[]
            {
                return this.singleColumn();
            }

            public visitLogicalList(_values: readonly boolean[], _isNA: readonly boolean[] | null, _attributes: RValue | null): Pair<string, EditableRecordSet>[]
            {
                return this.singleColumn();
            }

            public visitIntList(_values: readonly number[], _attributes: RValue | null): Pair<string, EditableRecordSet>[]
            {
                return this.singleColumn();
            }

            public visitDoubleList(_values: readonly number[], _attributes: RValue | null): Pair<string, EditableRecordSet>[]
            {
                return this.singleColumn();
            }

            public visitTemporalList(_dateTimeType: DateTimeInfo.DateTimeType, _values: readonly (TemporalAccessor | null)[], _attributes: RValue | null): Pair<string, EditableRecordSet>[]
            {
                return this.singleColumn();
            }

            public visitFactorList(_values: readonly number[], _levelNames: readonly string[]): Pair<string, EditableRecordSet>[]
            {
                return this.singleColumn();
            }

            public visitPairList(items: readonly RVisitor.PairListEntry[]): Pair<string, EditableRecordSet>[]
            {
                const r: Pair<string, EditableRecordSet>[] = [];
                for (const item of items)
                {
                    let found = ConvertFromR.convertRToTable(typeManager, item.item, allowMultipleTables);
                    if (item.tag !== null && found.length === 1)
                    {
                        const name = RUtility.getString(item.tag);
                        if (name !== null)
                        {
                            // Skip the random seed; very unlikely they want that as a table:
                            if (name === ".Random.seed")
                                continue;

                            found = [found[0]!.replaceFirst(name)];
                        }
                    }
                    r.push(...found);
                    if (!allowMultipleTables)
                        break;
                }
                return r;
            }

            public visitGenericList(values: readonly RValue[], attributes: RValue | null, isObject: boolean): Pair<string, EditableRecordSet>[]
            {
                // Tricky; could be a list of tables, a list of columns or a list of values!
                // First try as table (list of columns):
                const attrMap = RUtility.pairListToMap(attributes);

                const isDataFrame = isObject && ConvertFromR.isDataFrameOrTibble(attrMap);
                if (isDataFrame)
                {
                    const columns = Utility.mapListExI_Index(values, (i, v) => ConvertFromR.convertRToColumn(typeManager, v, ConvertFromR.getColumnName(attrMap.get("names") ?? null, i)));
                    // Check columns are all the same length:
                    if (columns.length !== 0 && new Set(columns.map(p => p.getSecond())).size === 1)
                    {
                        return [new Pair("Table", new EditableRecordSet(Utility.mapList(columns, p => p.getFirst()), () => columns[0]!.getSecond()))];
                    }
                    throw new UserException("Columns are of differing lengths: " + columns.map(p => "" + p.getSecond()).join(", "));
                }
                else
                {
                    let hasDataFrames = false;
                    if (allowMultipleTables)
                    {
                        for (const value of values)
                        {
                            const valueIsDataFrame = value.visit(new class extends DefaultRVisitor<boolean>
                            {
                                public override visitGenericList(_values: readonly RValue[], attributes: RValue | null, isObject: boolean): boolean
                                {
                                    const valueAttrMap = RUtility.pairListToMap(attributes);
                                    return isObject && ConvertFromR.isDataFrameOrTibble(valueAttrMap);
                                }
                            }(false));

                            if (valueIsDataFrame)
                            {
                                hasDataFrames = true;
                                break;
                            }
                        }
                    }
                    if (!hasDataFrames)
                    {
                        // Is it an object?
                        if (isObject && values.length > 1)
                        {
                            // Does it have names for class fields?
                            const names = attrMap.get("names") ?? null;
                            const named: Pair<string, RValue>[] = [];
                            for (let i = 0; i < values.length; i++)
                            {
                                const name = names === null ? null : RUtility.getString(RUtility.getListItem(names, i));
                                named.push(new Pair<string, RValue>(name === null ? "" : name, values[i]!));
                            }

                            // Java: ImmutableList.sortedCopyOf, a stable sort
                            return this.recordOrTable([...named].sort(Pair.comparatorFirst<string, RValue>()));
                        }
                        else if (isObject && values.length === 1)
                        {
                            // Dig in:
                            return ConvertFromR.convertRToTable(typeManager, values[0]!, allowMultipleTables);
                        }

                        return this.singleColumn();
                    }
                    else
                    {
                        const r: Pair<string, EditableRecordSet>[] = [];
                        for (const value of values)
                        {
                            r.push(...ConvertFromR.convertRToTable(typeManager, value, allowMultipleTables));
                        }
                        return r;
                    }
                }
            }
        }());
    }

    private static isDataFrameOrTibble(attrMap: ReadonlyMap<string, RValue>): boolean
    {
        return RUtility.isClass(attrMap, ...RUtility.CLASS_DATA_FRAME) || RUtility.isClass(attrMap, ...RUtility.CLASS_TIBBLE);
    }

    public static usToRTable(tableId: TableId): string
    {
        return javaReplace(tableId.getRaw(), " ", ".");
    }

    private static record(typeManager: TypeManager, fields: readonly Pair<string, RValue>[]): Pair<DataType, Value>
    {
        const r = new Map<ExpressionIdentifier, Pair<DataType, Value>>();

        for (let j = 0; j < fields.length; j++)
        {
            const recField = fields[j]!;
            const asList = ConvertFromR.convertRToTypedValueList(typeManager, recField.getSecond());
            const name = IdentifierUtility.fixExpressionIdentifier(recField.getFirst(), IdentifierUtility.identNum("Field", j));
            immutableMapBuilderPut(r, name, new Pair<DataType, Value>(asList.getSecond().length === 1 ? asList.getFirst() : DataType.array(asList.getFirst()), asList.getSecond().length === 1 ? asList.getSecond()[0]! : DataTypeUtility.value(asList.getSecond())));
        }

        const typedFields = r;

        const recordType = DataType.record(Utility.mapValues(typedFields, p => p.getFirst()));

        const recordValue: Record = new RecordMap(Utility.mapValues(typedFields, p => p.getSecond()));

        return new Pair<DataType, Value>(recordType, recordValue);
    }
}

export namespace ConvertFromR
{
    export enum TableType { DATA_FRAME, TIBBLE }
}
