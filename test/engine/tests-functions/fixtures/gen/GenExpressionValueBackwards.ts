// Port of test.gen.GenExpressionValueBackwards (tests-functions testFixtures).
import type { Column } from "../../../../../src/engine/data/data/Column.js";
import { KnownLengthRecordSet } from "../../../../../src/engine/data/data/KnownLengthRecordSet.js";
import { MemoryBooleanColumn } from "../../../../../src/engine/data/data/MemoryBooleanColumn.js";
import type { RecordSet } from "../../../../../src/engine/data/data/RecordSet.js";
import type { Expression } from "../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../../../src/engine/identifiers/id/TableId.js";
import type { Decimal } from "../../../../../src/engine/java/JavaBigDecimal.js";
import type { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../../src/engine/types/data/datatype/TypeManager.js";
import { Either } from "../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { BackwardsBooleans } from "./backwards/BackwardsBooleans.js";
import { BackwardsColumnRef } from "./backwards/BackwardsColumnRef.js";
import { BackwardsFixType } from "./backwards/BackwardsFixType.js";
import { BackwardsFromText } from "./backwards/BackwardsFromText.js";
import { BackwardsFunction } from "./backwards/BackwardsFunction.js";
import { BackwardsLiteral } from "./backwards/BackwardsLiteral.js";
import { BackwardsMatch } from "./backwards/BackwardsMatch.js";
import { BackwardsNumbers } from "./backwards/BackwardsNumbers.js";
import type { BackwardsProvider } from "./backwards/BackwardsProvider.js";
import { BackwardsRecord } from "./backwards/BackwardsRecord.js";
import { BackwardsTemporal } from "./backwards/BackwardsTemporal.js";
import { BackwardsText } from "./backwards/BackwardsText.js";
import type { ExpressionMaker } from "./backwards/ExpressionMaker.js";
import type { RequestBackwardsExpression } from "./backwards/RequestBackwardsExpression.js";
import { ExpressionValue } from "./ExpressionValue.js";
import { GenExpressionValueBase } from "./GenExpressionValueBase.js";

/**
 * Generates expressions and resulting values by working backwards.
 * At each step, we generate a target value and then make an expression which will
 * produce that value.  This tends to create better tests for things like pattern
 * matches or equality expressions because we make sure to create non-matching and matching guards (or passing equalities).
 * But it prevents using numeric expressions because we cannot be sure of exact
 * results due to precision (e.g. make me a function which returns 0.3333333; 1/3 might
 * not quite crack it).
 */
export class GenExpressionValueBackwards extends GenExpressionValueBase implements RequestBackwardsExpression
{
    private columnProvider!: BackwardsColumnRef;
    private providers!: readonly BackwardsProvider[];

    protected override generateValue(): ExpressionValue
    {
        this.numberOnlyInt = true;
        this.columnProvider = new BackwardsColumnRef(this.r, this);
        this.providers = [
            this.columnProvider,
            new BackwardsBooleans(this.r, this),
            new BackwardsFixType(this.r, this),
            new BackwardsFunction(this.r, this),
            new BackwardsFromText(this.r, this),
            new BackwardsLiteral(this.r, this),
            new BackwardsMatch(this.r, this),
            new BackwardsNumbers(this.r, this),
            new BackwardsTemporal(this.r, this),
            new BackwardsText(this.r, this),
            new BackwardsRecord(this.r, this),
        ];
        const type = this.makeType(this.r);
        const p = this.makeOfType(type);
        return new ExpressionValue(type, [p.getFirst()], this.getTypeManager(), new TableId("Backwards"), this.getRecordSet(), p.getSecond(), this);
    }

    public getTypeManager(): TypeManager
    {
        return this.dummyManager.getTypeManager();
    }

    public getRecordSet(): KnownLengthRecordSet
    {
        let columns: readonly ((rs: RecordSet) => Column)[] = this.columnProvider.getColumns();
        if (columns.length === 0)
            columns = [rs => new MemoryBooleanColumn(rs, new ColumnId("Column to avoid being empty"), [Either.right<string, boolean>(true)], true)];
        return new KnownLengthRecordSet(columns, 1);
    }

    // Only valid after calling generate
    public makeOfType(type: DataType): Pair<Value, Expression>
    {
        const value = this.makeValue(type);
        const expression = this.make(type, value, 4);
        return new Pair(value, expression);
    }

    public make(type: DataType, targetValue: Value, maxLevels: number): Expression
    {
        const terminals: ExpressionMaker[] = [];
        const deep: ExpressionMaker[] = [];
        for (const provider of this.providers)
        {
            terminals.push(...provider.terminals(type, targetValue));
            deep.push(...provider.deep(maxLevels, type, targetValue));
        }

        return this.register(this.termDeep(maxLevels, type, terminals, deep), type, targetValue);
    }

    private termDeep(maxLevels: number, _type: DataType, terminals: readonly ExpressionMaker[], deeper: readonly ExpressionMaker[]): Expression
    {
        if (terminals.length !== 0 && (maxLevels <= 1 || deeper.length === 0 || this.r.nextInt(0, 2) === 0))
            return this.r.choose(terminals)();
        else
            return this.r.choose(deeper)();
    }

    // Turn makeValue public:
    public override makeValue(t: DataType): Value
    {
        return super.makeValue(t);
    }

    // Make public:

    public override genInt(): Decimal
    {
        return super.genInt();
    }
}
