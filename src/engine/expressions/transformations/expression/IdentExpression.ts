// Port of xyz.columnal.transformations.expression.IdentExpression (expressions module).
import type { ExpressionIdentifier } from "../../../anns/Annotations.js";
import { HashMap, type ReadonlyMapLike } from "../../../java/HashMap.js";
import { javaObjectsHash } from "../../../java/JavaObject.js";
import type { JavaRandom } from "../../../java/JavaRandom.js";
import { GrammarUtility } from "../../../parsers/grammar/GrammarUtility.js";
import { ColumnId } from "../../../identifiers/id/ColumnId.js";
import type { TableAndColumnRenames } from "../../../identifiers/id/TableAndColumnRenames.js";
import { TableId } from "../../../identifiers/id/TableId.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../../types/data/datatype/DataTypeValue.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { MutVar, TypeExp } from "../../../types/typeExp/TypeExps.js";
import type { MutUnitVar } from "../../../types/typeExp/units/MutUnitVar.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { StyledString } from "../../../utility-error/styled/StyledString.js";
import { TaggedValue } from "../../../utility/utility/TaggedValue.js";
import { ListEx, Record, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import type { BracketedStatus } from "./BracketedStatus.js";
import type { ErrorAndTypeRecorder } from "./ErrorAndTypeRecorder.js";
import type { EvaluateState } from "./EvaluateState.js";
import { EvaluationException } from "./EvaluationException.js";
import { Explanation } from "./explanation/Explanation.js";
import { ExplanationLocation } from "./explanation/ExplanationLocation.js";
import { Expression, FieldAccessExpression, NonOperatorExpression } from "./Expressions.js";
import type { FunctionLookup } from "./function/FunctionLookup.js";
import type { StandardFunctionDefinition } from "./function/StandardFunctionDefinition.js";
import { ValueFunction } from "./function/ValueFunction.js";
import type { TypeState } from "./TypeState.js";
import type { ExpressionVisitor } from "./visitor/ExpressionVisitor.js";
import { ExpressionVisitorStream } from "./visitor/ExpressionVisitorStream.js";
import type { TypeManager as TypeManagerNS } from "../../../types/data/datatype/TypeManager.js";

type TagInfo = TypeManagerNS.TagInfo;

/**
 * A plain identifier.  If it resolves to a variable, it's a variable-use.  If not, it's an unresolved identifier.
 *
 * IdentExpression differs from InvalidIdentExpression
 * in that IdentExpression is always *syntactically* valid,
 * whereas InvalidIdentExpression is always syntactically
 * *invalid*, because it does not parse as an ident
 * and given its position, it cannot be treated as an
 * operator part of the expression (e.g. a trailing +
 * with no following operand)
 */
export class IdentExpression extends NonOperatorExpression
{
    // The name of the field in a table reference with the list of rows
    public static readonly ROWS: ExpressionIdentifier = "rows";
    public static readonly NAMESPACE_COLUMN: ExpressionIdentifier = "column";

    // TODO add resolver listener
    private readonly namespace: ExpressionIdentifier | null;
    private readonly idents: readonly ExpressionIdentifier[];
    private resolution: Resolution | null = null;

    private constructor(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[])
    {
        super();
        this.namespace = namespace;
        this.idents = idents;
    }

    // Java: load(@Nullable String namespace, ImmutableList<String> idents) and load(String ident)
    public static load(ident: ExpressionIdentifier): IdentExpression;
    public static load(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): IdentExpression;
    public static load(namespaceOrIdent: ExpressionIdentifier | null, idents?: readonly ExpressionIdentifier[]): IdentExpression
    {
        if (idents === undefined)
            return new IdentExpression(null, [namespaceOrIdent!]);
        return new IdentExpression(namespaceOrIdent, idents);
    }

    // Java: tag(String typeName, String tagName) and tag(String tagName)
    public static tag(typeNameOrTagName: ExpressionIdentifier, tagName?: ExpressionIdentifier): IdentExpression
    {
        if (tagName === undefined)
            return new IdentExpression("tag", [typeNameOrTagName]);
        return new IdentExpression("tag", [typeNameOrTagName, tagName]);
    }

    public static function(functionFullName: readonly ExpressionIdentifier[]): IdentExpression
    {
        return new IdentExpression("function", functionFullName);
    }

    public static table(tableName: ExpressionIdentifier): IdentExpression
    {
        return new IdentExpression("table", [tableName]);
    }

    // Java: column(@Nullable TableId tableName, ColumnId columnName) and column(ColumnId columnName)
    public static column(columnName: ColumnId): IdentExpression;
    public static column(tableName: TableId | null, columnName: ColumnId): IdentExpression;
    public static column(a: TableId | ColumnId | null, b?: ColumnId): IdentExpression
    {
        if (b === undefined)
            return new IdentExpression(IdentExpression.NAMESPACE_COLUMN, [(a as ColumnId).getRaw()]);
        const tableName = a as TableId | null;
        if (tableName === null)
            return IdentExpression.column(b);
        else
            return new IdentExpression(IdentExpression.NAMESPACE_COLUMN, [tableName.getRaw(), b.getRaw()]);
    }

    public static makeEntireColumnReference(tableId: TableId, columnId: ColumnId): Expression
    {
        return new FieldAccessExpression(IdentExpression.table(tableId.getRaw()), columnId.getRaw());
    }

    // Resolves all IdentExpression recursively throughout the
    // whole expression:
    // PORT-NOTE: Java collects the first exception from a lazy stream (so stops resolving at the
    // first failure) and then throws it; here the exception is thrown straight away, which stops
    // at the same point.
    public static resolveThroughout(expression: Expression, columnLookup: Expression.ColumnLookup, functionLookup: FunctionLookup, typeManager: TypeManager): void
    {
        expression.visit(new class extends ExpressionVisitorStream<never>
        {
            public override ident(self: IdentExpression, namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[], isVariable: boolean): never[]
            {
                const res = self.resolve(columnLookup, functionLookup, typeManager);
                if (res !== null)
                    self.resolution = res;
                return super.ident(self, namespace, idents, isVariable);
            }
        }());
    }


    public override check(dataLookup: Expression.ColumnLookup, original: TypeState, kind: Expression.ExpressionKind, _locationInfo: Expression.LocationInfo, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        // I think should now be impossible:
        const invalid = this.streamAllParts().find(n => !GrammarUtility.validIdentifier(n)) ?? null;
        if (invalid !== null)
        {
            onError.recordError(this, StyledString.s("Invalid identifier: \"" + invalid + "\""));
            return null;
        }

        if (this.resolution === null)
        {
            // Didn't find it anywhere:
            onError.recordError(this, StyledString.s("Unknown name: \"" + this.idents.join("\\") + "\""));
            const fix = dataLookup.getFixForIdent?.(this.namespace, this.idents, this) ?? null;
            if (fix !== null)
            {
                onError.recordQuickFixes(this, [fix]);
            }
            return null;
        }
        else
            return this.resolution.checkType(this, original, kind, onError);
    }

    private resolve(dataLookup: Expression.ColumnLookup, functionLookup: FunctionLookup, typeManager: TypeManager): Resolution | null
    {
        // Possible lookup destinations, in order of preference:
        // (Preference is roughly how likely it is that the user defined it and wants it)
        // - Local variable (cannot be scoped)
        // - Column name (Scope: "column")
        // - Table name (Scope: "table")
        // - Tag name (Scope: "tag")
        // - Standard function name (Scope: "function")

        const namespace = this.namespace;
        const idents = this.idents;
        if (namespace === null || namespace === IdentExpression.NAMESPACE_COLUMN)
        {
            let col: Expression.ColumnLookup.FoundColumn | null;
            let columnName: ColumnId;
            if (idents.length === 1)
            {
                columnName = new ColumnId(idents[0]!);
                col = dataLookup.getColumn(this, null, columnName);
            }
            else
            {
                columnName = new ColumnId(idents[1]!);
                col = dataLookup.getColumn(this, new TableId(idents[0]!), columnName);
            }
            if (col === null && namespace === IdentExpression.NAMESPACE_COLUMN)
            {
                //onError.recordError(this, StyledString.s("Could not find source column " + toText(namespace, idents)));
                return null;
            }
            else if (col !== null)
            {
                const resolvedTableName = col.tableCanBeOmitted ? null : col.tableId;
                const column = col.dataTypeValue;
                return new ColumnResolution(this, column, col, columnName, resolvedTableName);
            }
        }
        if (namespace === null || namespace === "table")
        {
            const table = dataLookup.getTable(new TableId(idents[0]!));
            if (table === null && namespace === "table")
            {
                return null;
            }
            else if (table !== null)
            {
                // PORT-NOTE: Java's HashMap order becomes the record type's field order, so it is kept.
                const fieldsAsSingle = HashMap.javaOrder<ExpressionIdentifier, TypeExp>();
                const fieldsAsList = HashMap.javaOrder<ExpressionIdentifier, TypeExp>();

                for (const [key, value] of table.getColumnTypes())
                {
                    fieldsAsList.set(key.getRaw(), TypeExp.list(this, TypeExp.fromDataType(this, value.getType())));
                    fieldsAsSingle.set(key.getRaw(), TypeExp.fromDataType(this, value.getType()));
                }

                let includeRows: boolean;
                if (!fieldsAsList.has(IdentExpression.ROWS))
                {
                    includeRows = true;
                    fieldsAsList.set(IdentExpression.ROWS, TypeExp.list(this, TypeExp.record(this, fieldsAsSingle, true)));
                }
                else
                    includeRows = false;
                const resolvedTable = table;
                return new TableResolution(this, resolvedTable, includeRows, fieldsAsList);
            }
        }
        if (namespace === null || namespace === "tag")
        {
            let tag: TagInfo | null = null;
            switch (idents.length)
            {
                case 1:
                    tag = typeManager.lookupTag(null, idents[0]!).leftToNull();
                    break;
                case 2:
                    tag = typeManager.lookupTag(idents[0]!, idents[1]!).leftToNull();
                    break;
                default:
                    if (namespace === "tag")
                    {
                        //onError.recordError(this, StyledString.s("Found " + idents.size() + " identifiers but tags should either have one (tag name) or two (type name, tag name)"));
                        return null;
                    }
                    break;
            }
            if (tag !== null)
            {
                const tagFinal = tag;
                return new TagResolution(this, tagFinal);
            }
        }
        if (namespace === null || namespace === "function")
        {
            const functionDefinition = functionLookup.lookup(idents.join("\\"));
            if (functionDefinition !== null)
            {
                const type = functionDefinition.getType(typeManager);
                return new FunctionResolution(this, functionDefinition, type);
            }
        }

        if ((namespace === null || namespace === "var") && idents.length === 1)
        {
            return new VariableResolution(this, namespace === "var");
        }


        if (namespace !== null && ![IdentExpression.NAMESPACE_COLUMN, "table", "tag", "function", "var"].includes(namespace))
        {
            // TODO give more specific error during checkType:
            //onError.recordError(this, StyledString.s("Unknown namespace or identifier: \"" + namespace + "\".  Known namespaces: column, table, tag, function."));
            return null;
        }
        return null;
    }

    private streamAllParts(): ExpressionIdentifier[]
    {
        return [...Utility.streamNullable(this.namespace), ...this.idents];
    }

    // Java: private, but used by the resolution classes
    public makeTagType(t: TagInfo): TypeExp
    {
        const taggedType = TypeExp.fromTagged(this, t.wholeType);
        return taggedType.getSecond()[t.tagIndex]!;
    }

    public override matchAsPattern(value: Value, state: EvaluateState): Expression.ValueResult
    {
        if (this.resolution === null)
            throw new InternalException("Calling matchAsPattern on variable without typecheck");
        else if (this.resolution.isDeclarationInMatch())
            return this.explanation(DataTypeUtility.value(true), Explanation.ExecutionType.MATCH, state.add(this.idents[0]!, value), [], [], false);
        else
            return super.matchAsPattern(value, state);
    }

    public override calculateValue(state: EvaluateState): Expression.ValueResult
    {
        if (this.resolution === null)
            throw new InternalException("Calling getValue on variable without typecheck");
        else
        {
            try
            {
                return this.resolution.getValue(state);
            }
            catch (e)
            {
                if (!(e instanceof UserException))
                    throw e;
                throw new EvaluationException(e, this, Explanation.ExecutionType.VALUE, state, []);
            }
        }
    }

    public override hideFromExplanation(skipIfTrivial: boolean): boolean
    {
        if (this.resolution !== null)
            return this.resolution.hideFromExplanation(skipIfTrivial);
        else
            return super.hideFromExplanation(skipIfTrivial);
    }

    public override save(saveDestination: Expression.SaveDestination, _surround: BracketedStatus, renames: TableAndColumnRenames): string
    {
        return IdentExpression.toText(this.resolution === null ? saveDestination.disambiguate(this.namespace, this.idents) : this.resolution.save(saveDestination, renames));
    }

    // Java: toText(Pair<namespace, idents>) and toText(namespace, idents)
    private static toText(namespaceAndIdents: Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>): string;
    private static toText(namespace: ExpressionIdentifier | null, idents: readonly ExpressionIdentifier[]): string;
    private static toText(a: Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]> | ExpressionIdentifier | null, b?: readonly ExpressionIdentifier[]): string
    {
        if (a instanceof Pair)
            return IdentExpression.toText(a.getFirst(), a.getSecond());
        const namespace = a;
        const idents = b!;
        let stringBuilder = "";
        if (namespace !== null)
            stringBuilder += namespace + "\\\\";
        for (let i = 0; i < idents.length; i++)
        {
            if (i > 0)
                stringBuilder += "\\";
            stringBuilder += idents[i];
        }
        return stringBuilder;
    }

    public override toDisplay(displayType: Expression.DisplayType, _bracketedStatus: BracketedStatus, expressionStyler: Expression.ExpressionStyler): StyledString
    {
        return expressionStyler(StyledString.s(displayType === Expression.DisplayType.SIMPLE ? this.idents[this.idents.length - 1]! : IdentExpression.toText(this.namespace, this.idents)), this);
    }

    public override _test_childMutationPoints(): Pair<Expression, (e: Expression) => Expression>[]
    {
        return [];
    }

    public override _test_typeFailure(_r: JavaRandom, _newExpressionOfDifferentType: Expression._test_TypeVary, _unitManager: UnitManager): Expression | null
    {
        return null;
    }

    public override equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof IdentExpression) || o.constructor !== this.constructor) return false;
        const that = o;
        return this.toString() === that.toString();
    }

    public override hashCode(): number
    {
        return javaObjectsHash(this.toString());
    }

    public override replaceSubExpression(toReplace: Expression, replaceWith: Expression): Expression
    {
        return this === toReplace ? replaceWith : this;
    }

    public override visit<T>(visitor: ExpressionVisitor<T>): T
    {
        return visitor.ident(this, this.namespace, this.idents, this.resolution !== null && this.resolution.isVariable());
    }

    /**
     * Only valid to call after type-checking!  Before that we can't know.
     */
    public isVarDeclaration(): boolean
    {
        return this.resolution !== null && this.resolution.isDeclarationInMatch();
    }

    /**
     * Only valid to call after type-checking!  Before that we can't know.
     * Bit hacky to provide this, but useful elsewhere...
     */
    public getResolvedConstructor(): TagInfo | null
    {
        return this.resolution !== null ? this.resolution.getResolvedConstructor() : null;
    }

    /**
     * Only valid to call after type-checking!  Before that we can't know.
     * Bit hacky to provide this, but useful elsewhere...
     */
    public getFunctionDefinition(): StandardFunctionDefinition | null
    {
        return this.resolution !== null ? this.resolution.getResolvedFunctionDefinition() : null;
    }

    // If parameter is IdentExpression with single ident and no namespace, return the ident
    public static getSingleIdent(expression: Expression): ExpressionIdentifier | null
    {
        if (expression instanceof IdentExpression)
        {
            const identExpression = expression;
            if (identExpression.namespace === null && identExpression.idents.length === 1)
                return identExpression.idents[0]!;
        }
        return null;
    }

    // Java: private fields, read by the inner resolution classes
    public _getIdents(): readonly ExpressionIdentifier[]
    {
        return this.idents;
    }
}

// Java's private interface Resolution, with its default methods
abstract class Resolution
{
    public isDeclarationInMatch(): boolean
    {
        return false;
    }

    public abstract hideFromExplanation(skipIfTrivial: boolean): boolean;

    public abstract getValue(state: EvaluateState): Expression.ValueResult;

    public abstract save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>;

    public abstract isVariable(): boolean;

    public getResolvedConstructor(): TagInfo | null
    {
        return null;
    }

    public getResolvedFunctionDefinition(): StandardFunctionDefinition | null
    {
        return null;
    }

    public abstract checkType(identExpression: IdentExpression, state: TypeState, expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null;
}

// The resolution classes are Java inner classes of IdentExpression; outer is IdentExpression.this.

class ColumnResolution extends Resolution
{
    public constructor(private readonly outer: IdentExpression, private readonly column: DataTypeValue, private readonly col: Expression.ColumnLookup.FoundColumn, private readonly columnName: ColumnId, private readonly resolvedTableName: TableId | null)
    {
        super();
    }

    public override hideFromExplanation(skipIfTrivial: boolean): boolean
    {
        return skipIfTrivial;
    }

    public override getValue(state: EvaluateState): Expression.ValueResult
    {
        const explanationLocation = new ExplanationLocation(this.col.tableId, this.columnName, state.getRowIndex());
        return this.outer.resultIsLocation(this.column.getCollapsed(state.getRowIndex()), state, [], explanationLocation, false);
    }

    public override isVariable(): boolean
    {
        return false;
    }

    private getFoundNamespace(): ExpressionIdentifier
    {
        return IdentExpression.NAMESPACE_COLUMN;
    }

    public override save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
    {
        const renamed = renames.columnId(this.resolvedTableName, this.columnName, null);

        const renamedTableId = renamed.getFirst();
        const tablePlusColumn: ExpressionIdentifier[] = renamedTableId !== null ? [renamedTableId.getRaw(), renamed.getSecond().getRaw()] : [renamed.getSecond().getRaw()];

        return saveDestination.disambiguate(this.getFoundNamespace(), tablePlusColumn);
    }

    public override checkType(identExpression: IdentExpression, state: TypeState, _expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        if (this.col.information !== null)
        {
            onError.recordInformation(identExpression, this.col.information);
        }
        return onError.recordType(identExpression, state, TypeExp.fromDataType(this.outer, this.column.getType()));
    }
}

class TableResolution extends Resolution
{
    public constructor(private readonly outer: IdentExpression, private readonly resolvedTable: Expression.ColumnLookup.FoundTable, private readonly includeRows: boolean, private readonly fieldsAsList: HashMap<ExpressionIdentifier, TypeExp>)
    {
        super();
    }

    private getFoundNamespace(): ExpressionIdentifier
    {
        return "table";
    }

    public override hideFromExplanation(_skipIfTrivial: boolean): boolean
    {
        // We never want to see a full table in an explanation
        return true;
    }

    public override save(saveDestination: Expression.SaveDestination, renames: TableAndColumnRenames): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
    {
        return saveDestination.disambiguate(this.getFoundNamespace(), [renames.tableId(new TableId(this.outer._getIdents()[0]!)).getRaw()]);
    }

    public override getValue(state: EvaluateState): Expression.ValueResult
    {
        const resolvedTableNN = this.resolvedTable;
        const columnTypes: ReadonlyMapLike<ColumnId, DataTypeValue> = resolvedTableNN.getColumnTypes();
        const includeRows = this.includeRows;

        class ColumnAsList extends ListEx
        {
            private readonly dataTypeValue: DataTypeValue;

            public constructor(dataTypeValue: DataTypeValue)
            {
                super();
                this.dataTypeValue = dataTypeValue;
            }

            public override size(): number
            {
                return resolvedTableNN.getRowCount();
            }

            public override get(index: number): Value
            {
                return this.dataTypeValue.getCollapsed(index);
            }
        }

        class RowsAsList extends ListEx
        {
            public override size(): number
            {
                return resolvedTableNN.getRowCount();
            }

            public override get(index: number): Value
            {
                const rowValues = new Map<ExpressionIdentifier, Value>();
                for (const [key, value] of columnTypes)
                {
                    rowValues.set(key.getRaw(), value.getCollapsed(index));
                }

                return DataTypeUtility.value(new class extends Record
                {
                    public override getField(name: ExpressionIdentifier): Value
                    {
                        return Utility.getOrThrow(rowValues, name, () => new InternalException("Cannot find column " + name));
                    }

                    public override getFullContent(): ReadonlyMap<ExpressionIdentifier, Value>
                    {
                        return rowValues;
                    }
                }());
            }
        }

        const result = DataTypeUtility.value(new class extends Record
        {
            public override getField(name: ExpressionIdentifier): Value
            {
                if (includeRows && name === IdentExpression.ROWS)
                    return DataTypeUtility.value(new RowsAsList());
                return DataTypeUtility.value(new ColumnAsList(Utility.getOrThrow(columnTypes, new ColumnId(name), () => new InternalException("Cannot find column " + name))));
            }

            public override getFullContent(): ReadonlyMap<ExpressionIdentifier, Value>
            {
                return new Map([...columnTypes].map(([k, v]) => [k.getRaw(), DataTypeUtility.value(new ColumnAsList(v))] as const));
            }
        }());

        const loc = new ExplanationLocation(new TableId(this.outer._getIdents()[0]!));
        return this.outer.resultIsLocation(result, state, [], loc, true);
    }

    public override isVariable(): boolean
    {
        return false;
    }

    public override checkType(_identExpression: IdentExpression, state: TypeState, _expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        return new Expression.CheckedExp(onError.recordType(this.outer, TypeExp.record(this.outer, this.fieldsAsList, true)), state);
    }
}

class TagResolution extends Resolution
{
    public constructor(private readonly outer: IdentExpression, private readonly tagFinal: TagInfo)
    {
        super();
    }

    public override isVariable(): boolean
    {
        return false;
    }

    private getFoundNamespace(): ExpressionIdentifier
    {
        return "tag";
    }

    public override hideFromExplanation(_skipIfTrivial: boolean): boolean
    {
        // Tags themselves are always trivial as they are literals
        return true;
    }

    private getFoundFullName(): readonly ExpressionIdentifier[]
    {
        return [this.tagFinal.getTypeName().getRaw(), this.tagFinal.getTagInfo().getName()];
    }

    public override getResolvedConstructor(): TagInfo | null
    {
        return this.tagFinal;
    }

    public override save(saveDestination: Expression.SaveDestination, _renames: TableAndColumnRenames): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
    {
        return saveDestination.disambiguate(this.getFoundNamespace(), this.getFoundFullName());
    }

    public override getValue(state: EvaluateState): Expression.ValueResult
    {
        const tagFinal = this.tagFinal;
        let value: Value;
        if (tagFinal.getTagInfo().getInner() === null)
            value = new TaggedValue(tagFinal.tagIndex, null, tagFinal.wholeType);
        else
            value = ValueFunction.value(new class extends ValueFunction
                {
                    public constructor()
                    {
                        super();
                    }

                    public override _call(): Value
                    {
                    return new TaggedValue(tagFinal.tagIndex, this.arg(0), tagFinal.wholeType);
        }
                }());
        return this.outer.result(value, state, []);
    }

    public override checkType(_identExpression: IdentExpression, state: TypeState, _expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        return onError.recordType(this.outer, state, this.outer.makeTagType(this.tagFinal));
    }
}

class FunctionResolution extends Resolution
{
    public constructor(private readonly outer: IdentExpression, private readonly functionDefinition: StandardFunctionDefinition, private readonly type: Pair<TypeExp, ReadonlyMap<string, Either<MutUnitVar, MutVar>>>)
    {
        super();
    }

    public override hideFromExplanation(_skipIfTrivial: boolean): boolean
    {
        // Functions can't be explained anyway:
        return true;
    }

    public override isVariable(): boolean
    {
        return false;
    }

    private getFoundNamespace(): ExpressionIdentifier
    {
        return "function";
    }

    private getFoundFullName(): readonly ExpressionIdentifier[]
    {
        return this.functionDefinition.getFullName();
    }

    public override save(saveDestination: Expression.SaveDestination, _renames: TableAndColumnRenames): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
    {
        return saveDestination.disambiguate(this.getFoundNamespace(), this.getFoundFullName());
    }

    public override getResolvedFunctionDefinition(): StandardFunctionDefinition | null
    {
        return this.functionDefinition;
    }

    public override getValue(state: EvaluateState): Expression.ValueResult
    {
        const functionDefinition = this.functionDefinition;
        return this.outer.result(ValueFunction.value(functionDefinition.getInstance(state.getTypeManager(), s => {
            const typeExp = this.type.getSecond().get(s);
            if (typeExp === undefined)
                throw new InternalException("Type " + s + " cannot be found for function " + functionDefinition.getName());
            return typeExp.mapBothEx<Unit, DataType>(u => {
                const concrete = u.toConcreteUnit();
                if (concrete === null)
                    throw new UserException("Could not resolve unit " + s + " to a concrete unit from " + u.toString());
                return concrete;
            }, t => t.toConcreteType(state.getTypeManager(), false).eitherEx(
                    l => {
                        throw new UserException(StyledString.concat(StyledString.s("Ambiguous type for call to " + functionDefinition.getName() + " "), l.getErrorText()));
                    },
                    t2 => t2,
            ));
        })), state);
    }

    public override checkType(_identExpression: IdentExpression, state: TypeState, _expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        return onError.recordType(this.outer, state, this.type.getFirst());
    }
}

class VariableResolution extends Resolution
{
    private explicitVarNamespace: boolean;
    private patternMatch = false;

    public constructor(private readonly outer: IdentExpression, explicitVarNamespace: boolean)
    {
        super();
        this.explicitVarNamespace = explicitVarNamespace;
    }

    public override hideFromExplanation(skipIfTrivial: boolean): boolean
    {
        return skipIfTrivial || this.patternMatch;
    }

    public override isDeclarationInMatch(): boolean
    {
        return this.patternMatch;
    }

    public override isVariable(): boolean
    {
        return true;
    }

    private getFoundNamespace(): ExpressionIdentifier | null
    {
        return this.explicitVarNamespace ? "var" : null;
    }

    private getFoundFullName(): readonly ExpressionIdentifier[]
    {
        return this.outer._getIdents();
    }

    public override getValue(state: EvaluateState): Expression.ValueResult
    {
        if (this.patternMatch)
            throw new InternalException("Calling getValue on variable declaration (should only call matchAsPattern)");
        return this.outer.result(state.get(this.outer._getIdents()[0]!), state);
    }

    public override save(saveDestination: Expression.SaveDestination, _renames: TableAndColumnRenames): Pair<ExpressionIdentifier | null, readonly ExpressionIdentifier[]>
    {
        return saveDestination.disambiguate(this.getFoundNamespace(), this.getFoundFullName());
    }

    public override checkType(identExpression: IdentExpression, original: TypeState, expressionKind: Expression.ExpressionKind, onError: ErrorAndTypeRecorder): Expression.CheckedExp | null
    {
        const idents = this.outer._getIdents();
        const varType = original.findVarType(idents[0]!);
        this.patternMatch = varType === null && expressionKind === Expression.ExpressionKind.PATTERN;
        if (varType !== null)
        {
            // Now confident it's a var:
            this.explicitVarNamespace = true;

            // If they're trying to use a variable with many types, it justifies us trying to unify all the types:
            return onError.recordTypeAndError(identExpression, TypeExp.unifyTypes(varType), original);
        }
        else if (this.patternMatch)
        {
            // Assume it's a var:
            this.explicitVarNamespace = true;

            const patternType = new MutVar(identExpression);
            const state = original.add(idents[0]!, patternType, s => onError.recordError(this, s));
            if (state === null)
                return null;
            return onError.recordType(identExpression, state, patternType);
        }
        else
        {
            onError.recordError(identExpression, StyledString.s("Unknown variable: \"" + idents[0]! + "\""));
            return null;
        }
    }
}
