// Port of xyz.columnal.rinterop.RWrite (r-interop module).
import { DataOutputStream } from "../../java/DataStreams.js";
import { IOException } from "../../java/JavaExceptions.js";
import { javaUtf8Bytes } from "../../java/JavaString.js";
import type { LocalDate, LocalDateTime, LocalTime, YearMonth, ZonedDateTime } from "../../java/time/JavaTime.js";
import { ZoneOffset } from "../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import { UserException } from "../../utility-error/error/UserException.js";
import { Utility } from "../../utility/utility/Utility.js";
import { RUtility } from "./RUtility.js";
import type { RValue } from "./RValue.js";
import { RVisitor } from "./RVisitor.js";

import PairListEntry = RVisitor.PairListEntry;

class RWriteVisitor implements RVisitor<null>
{
    public constructor(private readonly d: DataOutputStream)
    {
    }

    private writeInt(value: number): void
    {
        try
        {
            this.d.writeInt(value);
        }
        catch (e)
        {
            if (!(e instanceof IOException))
                throw e;
            throw new UserException("IO error", e);
        }
    }

    // Java: writeHeader(int, RValue, RValue) and writeHeader(int, RValue, RValue, boolean isObject)
    private writeHeader(value: number, attributes: RValue | null, tag: RValue | null, isObject: boolean = false): void
    {
        try
        {
            this.d.writeInt(value | (isObject ? 0x100 : 0) | (attributes !== null ? 0x200 : 0) | (tag !== null ? 0x400 : 0));
            if (value === RUtility.PAIR_LIST)
            {
                this.writeAttributes(attributes);
                this.writeAttributes(tag);
            }
        }
        catch (e)
        {
            if (!(e instanceof IOException))
                throw e;
            throw new UserException("IO error", e);
        }
    }

    private writeDouble(value: number): void
    {
        try
        {
            this.d.writeDouble(value);
        }
        catch (e)
        {
            if (!(e instanceof IOException))
                throw e;
            throw new UserException("IO error", e);
        }
    }

    private writeBytes(value: Uint8Array): void
    {
        try
        {
            this.d.write(value);
        }
        catch (e)
        {
            if (!(e instanceof IOException))
                throw e;
            throw new UserException("IO error", e);
        }
    }

    private writeAttributes(attributes: RValue | null): void
    {
        if (attributes === null)
            return;
        attributes.visit(this);
    }

    public visitString(s: string | null, isSymbol: boolean): null
    {
        if (isSymbol)
            this.writeInt(RUtility.SYMBOL);
        this.writeInt(RUtility.STRING_SINGLE);
        this.writeLenString(s);
        return null;
    }

    private writeLenString(s: string | null): void
    {
        if (s === null)
            this.writeInt(-1);
        else
        {
            const bytes = javaUtf8Bytes(s);
            this.writeInt(bytes.length);
            this.writeBytes(bytes);
        }
    }

    public visitStringList(values: readonly (string | null)[], attributes: RValue | null): null
    {
        this.writeHeader(RUtility.STRING_VECTOR, attributes, null);
        this.writeInt(values.length);
        for (const value of values)
        {
            this.writeInt(RUtility.STRING_SINGLE);
            this.writeLenString(value);
        }
        this.writeAttributes(attributes);
        return null;
    }

    public visitTemporalList(dateTimeType: DateTimeInfo.DateTimeType, values: readonly (TemporalAccessor | null)[], attributes: RValue | null): null
    {
        switch (dateTimeType)
        {
            case DateTimeInfo.DateTimeType.YEARMONTHDAY:
                this.writeHeader(RUtility.DOUBLE_VECTOR, attributes, null);
                this.writeInt(values.length);
                for (const value of values)
                {
                    if (value !== null)
                        this.writeDouble((value as LocalDate).toEpochDay());
                    else
                        this.writeDouble(NaN);
                }
                this.writeAttributes(attributes);
                break;
            case DateTimeInfo.DateTimeType.DATETIME:
                this.writeHeader(RUtility.DOUBLE_VECTOR, attributes, null);
                this.writeInt(values.length);
                for (const value of values)
                {
                    if (value !== null)
                    {
                        const ldt = value as LocalDateTime;
                        const seconds = ldt.toEpochSecond(ZoneOffset.UTC) + ldt.nano() / 1_000_000_000.0;
                        this.writeDouble(seconds / (60.0 * 60.0 * 24.0));
                    }
                    else
                        this.writeDouble(NaN);
                }
                this.writeAttributes(attributes);
                break;
            case DateTimeInfo.DateTimeType.DATETIMEZONED:
                this.writeHeader(RUtility.DOUBLE_VECTOR, attributes, null);
                this.writeInt(values.length);
                for (const value of values)
                {
                    if (value !== null)
                    {
                        const zdt = value as ZonedDateTime;
                        this.writeDouble(zdt.toEpochSecond() + (zdt.nano() / 1_000_000_000.0));
                    }
                    else
                        this.writeDouble(NaN);
                }
                this.writeAttributes(attributes);
                break;
            case DateTimeInfo.DateTimeType.TIMEOFDAY:
                this.writeHeader(RUtility.DOUBLE_VECTOR, attributes, null);
                this.writeInt(values.length);
                for (const value of values)
                {
                    if (value !== null)
                    {
                        const lt = value as LocalTime;
                        this.writeDouble(lt.toNanoOfDay() / 1_000_000_000.0);
                    }
                    else
                        this.writeDouble(NaN);
                }
                this.writeAttributes(attributes);
                break;
            case DateTimeInfo.DateTimeType.YEARMONTH:
                this.writeHeader(RUtility.DOUBLE_VECTOR, attributes, null);
                this.writeInt(values.length);
                for (const value of values)
                {
                    if (value !== null)
                    {
                        const yearMonth = value as YearMonth;
                        this.writeDouble(yearMonth.atDay(1).toEpochDay());
                    }
                    else
                        this.writeDouble(NaN);
                }
                this.writeAttributes(attributes);
                break;
        }
        return null;
    }

    public visitIntList(values: readonly number[], attributes: RValue | null): null
    {
        this.writeHeader(RUtility.INT_VECTOR, attributes, null);
        this.writeInt(values.length);
        for (const value of values)
        {
            this.writeInt(value);
        }
        this.writeAttributes(attributes);
        return null;
    }

    public visitDoubleList(values: readonly number[], attributes: RValue | null): null
    {
        this.writeHeader(RUtility.DOUBLE_VECTOR, attributes, null);
        this.writeInt(values.length);
        for (const value of values)
        {
            this.writeDouble(value);
        }
        this.writeAttributes(attributes);
        return null;
    }

    public visitLogicalList(values: readonly boolean[], isNA: readonly boolean[] | null, attributes: RValue | null): null
    {
        this.writeHeader(RUtility.LOGICAL_VECTOR, attributes, null);
        this.writeInt(values.length);
        for (let i = 0; i < values.length; i++)
        {
            this.writeInt(isNA !== null && isNA[i]! ? RUtility.NA_AS_INTEGER : (values[i]! ? 1 : 0));
        }
        this.writeAttributes(attributes);
        return null;
    }

    public visitGenericList(values: readonly RValue[], attributes: RValue | null, isObject: boolean): null
    {
        this.writeHeader(RUtility.GENERIC_VECTOR, attributes, null, isObject);
        this.writeInt(values.length);
        for (const value of values)
        {
            value.visit(this);
        }
        this.writeAttributes(attributes);
        return null;
    }

    public visitPairList(items: readonly PairListEntry[]): null
    {
        switch (items.length)
        {
            case 0:
                break;
            case 1:
                this.writeHeader(RUtility.PAIR_LIST, items[0]!.attributes, items[0]!.tag);
                items[0]!.item.visit(this);
                this.visitNil();
                break;
            default:
                this.writeHeader(RUtility.PAIR_LIST, items[0]!.attributes, items[0]!.tag);
                items[0]!.item.visit(this);
                this.visitPairList(items.slice(1));
                break;
        }
        return null;
    }

    public visitFactorList(values: readonly number[], levelNames: readonly string[]): null
    {
        const attributes = RUtility.makePairList([new PairListEntry(null, RUtility.string("levels", false), RUtility.stringVector(Utility.mapListI(levelNames, s => s), null))]);
        return this.visitIntList(values, attributes);
    }

    public visitNil(): null
    {
        this.writeInt(RUtility.NIL);
        return null;
    }
}

export class RWrite
{
    /**
     * PORT-NOTE: Java writes to a file; here the bytes are returned, for the caller to save
     * (the engine does not write files; see JavaFile.ts).
     */
    public static writeRData(topLevel: RValue): Uint8Array
    {
        const d = new DataOutputStream();
        // TODO compress
        d.writeByte("X".charCodeAt(0));
        d.writeByte("\n".charCodeAt(0));
        d.writeInt(3);
        d.writeInt(0x03_06_01); // We should match R 3.6.1
        d.writeInt(0x03_05_00);
        d.writeInt("UTF-8".length);
        d.writeBytes("UTF-8");
        topLevel.visit(new RWriteVisitor(d));
        return d.toByteArray();
    }
}
