// Port of xyz.columnal.data.NumericColumnStorage (data module).
//
// PORT-NOTE: the Java class saves memory by storing the numbers in the smallest array that
// fits them all (byte, then short, int and long), with BigDecimals in a separate array.  That
// was only an optimisation, so this port keeps two tiers: whole numbers that a double holds
// exactly (|n| <= 2^53) are stored in a Float64Array, and NaN there means the number is in the
// decimals array (only allocated once needed).  The values stored and returned are the same.
// The one visible difference is getInt, used for tag indexes: Java fails for any number held
// in its long/BigDecimal arrays, this fails only for a non-integer or one outside int range.
import { javaListAddAll } from "../../java/JavaCollections.js";
import { Decimal, parseBigDecimal, ZERO } from "../../java/JavaBigDecimal.js";
import { NumberFormatException } from "../../java/JavaString.js";
import { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { ProgressListener } from "../../types/data/datatype/ProgressListener.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationRunnable } from "../../utility-functional/utility/function/simulation/SimulationRunnable.js";
import type { ColumnStorage } from "./ColumnStorage.js";
import { SparseErrorColumnStorage } from "./SparseErrorColumnStorage.js";

const MAX_EXACT = 2 ** 53;

/**
 * A class to store numbers or a series of values of the type
 * Tag0, Tag1 Number, Tag2, Tag3, i.e. where at most one tag
 * has a number argument.  This includes
 * the case where none of the tags have a number argument;
 * this class works well for that case.
 *
 * (See the PORT-NOTE above for how the numbers are stored.)
 */
export class NumericColumnStorage extends SparseErrorColumnStorage<Decimal> implements ColumnStorage<Decimal>
{
    private _filled = 0;
    // Whole numbers which a double holds exactly; NaN means consult the decimals array.
    private numbers = new Float64Array(8);
    // Any other numbers, at the same index as their NaN.
    // Note that decimals.length <= numbers.length, not ==
    private decimals: (Decimal | null)[] | null = null;

    private dataType: DataTypeValue | null = null;
    private readonly displayInfo: NumberInfo;
    private readonly beforeGet: ColumnStorage.BeforeGet<NumericColumnStorage> | null;

    // Java has three constructors: (NumberInfo, boolean), (boolean) and (NumberInfo, BeforeGet, boolean).
    public constructor(isImmediateData: boolean);
    public constructor(displayInfo: NumberInfo, isImmediateData: boolean);
    public constructor(displayInfo: NumberInfo, beforeGet: ColumnStorage.BeforeGet<NumericColumnStorage> | null, isImmediateData: boolean);
    public constructor(a: NumberInfo | boolean, b?: ColumnStorage.BeforeGet<NumericColumnStorage> | null | boolean, c?: boolean)
    {
        const isImmediateData = typeof a === "boolean" ? a : typeof b === "boolean" ? b : c!;
        super(isImmediateData);
        this.displayInfo = typeof a === "boolean" ? NumberInfo.DEFAULT : a;
        this.beforeGet = typeof b === "function" ? b : null;
    }

    public addRead(number: string): void
    {
        number = number.replaceAll(",", ""); // TODO parameterise this behaviour
        // PORT-NOTE: Java first tries to parse as a long, but DECIMAL128 holds every long
        // exactly, so parsing as a decimal gives the same value.
        try
        {
            this.addDecimal(null, parseBigDecimal(number, true));
        }
        catch (e)
        {
            if (!(e instanceof NumberFormatException))
                throw e;
            this.addAll([Either.left<string, Decimal>(number)]);
        }
    }

    // Stores n at index, or at the end if index is null.
    private addDecimal(index: number | null, n: Decimal): void
    {
        const isExact = n.isInteger() && n.abs().lte(MAX_EXACT);
        if (!isExact && this.decimals === null)
            this.decimals = new Array<Decimal | null>(this.numbers.length).fill(null);
        if (index === null)
        {
            if (this._filled >= this.numbers.length)
            {
                const bigger = new Float64Array(this.increaseLength(this.numbers.length));
                bigger.set(this.numbers);
                this.numbers = bigger;
            }
            index = this._filled++;
        }
        else if (index < 0 || index >= this._filled)
            throw new InternalException("Out of bounds: " + index + " filled: " + this._filled);

        if (isExact)
        {
            this.numbers[index] = n.toNumber();
            if (this.decimals !== null && index < this.decimals.length)
                this.decimals[index] = null;
        }
        else
        {
            this.numbers[index] = NaN;
            const decimals = this.decimals!;
            while (index >= decimals.length)
                decimals.push(null);
            decimals[index] = n;
        }
    }

    private increaseLength(length: number): number
    {
        return Math.max(this._filled, length) * 2;
    }

    public filled(): number
    {
        return this._filled;
    }

    private getNonBlank(index: number, _progressListener: ProgressListener | null): Decimal
    {
        this.checkRange(index);

        const n = this.numbers[index]!;
        if (Number.isNaN(n))
        {
            const decimal = this.decimals?.[index];
            if (decimal === undefined || decimal === null)
                throw new InternalException("NaN but no decimal in NumericColumnStorage");
            return decimal;
        }
        return n === 0 ? ZERO : new Decimal(n);
    }

    // Returns numericTag if that item is not a tag
    public getInt(index: number): number
    {
        this.checkRange(index);
        const n = this.numbers[index]!;
        if (Number.isNaN(n) || (n | 0) !== n)
            throw new InternalException("Int not found in NumericColumnStorage; only longs/decimals");
        return n;
    }

    private checkRange(index: number): void
    {
        if (index < 0 || index >= this._filled)
            throw new UserException("Trying to access zero-based element " + index + " but only have " + this._filled);
    }

    public getType(): DataTypeValue
    {
        if (this.dataType === null)
        {
            this.dataType = DataTypeValue.number(this.displayInfo, this.getValueOrError<Decimal>({
                _beforeGet: (index, progressListener) =>
                {
                    if (this.beforeGet !== null)
                        this.beforeGet(this, index, progressListener);
                },

                _getWithProgress: (i, prog) =>
                {
                    return this.getNonBlank(i, prog);
                },

                _set: (index, value) =>
                {
                    if (value === null)
                        value = ZERO;

                    if (index === this._filled)
                    {
                        this.set(null, value);
                    }
                    else
                    {
                        this.set(index, value);
                    }
                },
            }));
        }
        return this.dataType;
    }

    protected override _insertRows(index: number, items: readonly (Decimal | null)[]): SimulationRunnable
    {
        this.addAll(index, items.map(n => n === null ? ZERO : n));
        const count = items.length;
        return () => { this._removeRows(index, count); };
    }

    protected override _removeRows(index: number, count: number): SimulationRunnable
    {
        const old = this.getAllCollapsed(index, index + count);
        this.numbers.copyWithin(index, index + count, this._filled);
        if (this.decimals !== null && index + count < this.decimals.length)
            this.decimals.splice(index, count);
        this._filled -= count;
        // Can't use ImmutableList because of nulls:
        return () => { this._insertRows(index, old.map(e => e.either<Decimal | null>(_s => null, n => n))); };
    }

    public addAll(items: Iterable<Either<string, Decimal>>): void;
    public addAll(insertAtIndex: number, newNumbers: readonly Decimal[]): void;
    public addAll(a: Iterable<Either<string, Decimal>> | number, newNumbers?: readonly Decimal[]): void
    {
        if (typeof a === "number")
            this.addAllAt(a, newNumbers!);
        else
            this._addAll(a);
    }

    public _addAll(items: Iterable<Either<string, Decimal>>): number
    {
        let count = 0;
        // TODO this could be improved rather than calling add lots of times
        for (const item of items)
        {
            this.add(item.either(err =>
            {
                this.setError(this._filled, err);
                return ZERO;
            }, v => v));
            count++;
        }
        return count;
    }

    // If index is null, add at end.
    // public for testing
    public set(index: number | null, n: Decimal): void
    {
        this.addDecimal(index, n);
    }

    public override add(n: Decimal): void
    {
        this.set(null, n);
    }

    public getDisplayInfo(): NumberInfo
    {
        return this.displayInfo;
    }

    // Java: addAll(int insertAtIndex, Stream<Number> newNumbers)
    private addAllAt(insertAtIndex: number, newNumbers: readonly Decimal[]): void
    {
        const originalLength = this._filled;
        // First, add them on the end:
        const newNumbersSize = this._addAll(newNumbers.map(x => Either.right<string, Decimal>(x)));
        // Now, swap existing numbers and new numbers:
        // New to temp:
        const newVals = this.numbers.slice(originalLength, this._filled);
        // Old to new:
        this.numbers.copyWithin(insertAtIndex + newNumbersSize, insertAtIndex, originalLength);
        // New [temp] to old:
        this.numbers.set(newVals, insertAtIndex);

        if (this.decimals !== null)
        {
            // Decimals can be less than filled in length.  Although a bit inefficient, we size up first
            // before doing the copy (more straightforward than handling various fiddly cases):
            while (this.decimals.length < this._filled)
                this.decimals.push(null);

            const newValsD = this.decimals.splice(originalLength, newNumbersSize);
            javaListAddAll(this.decimals, insertAtIndex, newValsD);
        }
    }
}
