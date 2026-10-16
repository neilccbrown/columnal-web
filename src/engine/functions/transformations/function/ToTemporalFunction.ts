// Port of xyz.columnal.transformations.function.ToTemporalFunction (functions module).
import type { FuncDocKey } from "../../../anns/Annotations.js";
import { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { DateTimeParseException, TemporalQuery, isDateTimeException, javaMessage, type DateTimeFormatter, type TemporalAccessor as JsJodaTemporalAccessor } from "../../../java/time/JavaTime.js";
import type { TemporalAccessor } from "../../../java/time/TemporalAccessor.js";
import { ValueClass, type DataType } from "../../../types/data/datatype/DataType.js";
import type { DateTimeInfo } from "../../../types/data/datatype/DateTimeInfo.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import type { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";
import { javaClassName, Utility } from "../../../utility/utility/Utility.js";
import type { Value } from "../../../utility/utility/Value.js";
import { FunctionDefinition } from "./FunctionDefinition.js";

/**
 * Created by neil on 15/12/2016.
 */
export abstract class ToTemporalFunction
{
    // Public for testing purposes only
    public _test_fromString(name: FuncDocKey): FunctionDefinition
    {
        return this.fromString(name);
    }

    protected fromString(name: FuncDocKey): FunctionDefinition
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the inner class's outer instance
        const outer = this;
        return new class extends FunctionDefinition
        {
            public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
            {
                return new ToTemporalFunction.FromStringInstance(outer, name);
            }
        }(name);
    }

    public abstract getResultType(): DateTimeInfo;

    // If two formats may be mistaken for each other, put them in the same inner list:
    public getFormats(): readonly (readonly DateTimeFormatter[])[]
    {
        return this.getResultType().getFlexibleFormatters();
    }

    public abstract fromTemporal(temporalAccessor: JsJodaTemporalAccessor): TemporalAccessor;

    public abstract getTemporalFunctions(mgr: UnitManager): readonly FunctionDefinition[];
}

export namespace ToTemporalFunction
{
    // Java: private inner class
    export class FromStringInstance extends ValueFunction
    {
        private readonly outer: ToTemporalFunction;
        private readonly usedFormats: Pair<readonly DateTimeFormatter[], number>[] = [];
        private readonly unusedFormats: (readonly DateTimeFormatter[])[];
        private readonly name: string;

        public constructor(outer: ToTemporalFunction, name: string)
        {
            super();
            this.outer = outer;
            this.unusedFormats = [...outer.getFormats()];
            this.name = name;
        }

        public override _call(): Value
        {
            const src = Utility.preprocessDate(this.arg(0, ValueClass.STRING));

            for (let i = 0; i < this.usedFormats.length; i++)
            {
                const formats = this.usedFormats[i]!;
                const possibilities = this.getPossibles(src, formats.getFirst());
                if (possibilities.length === 1)
                {
                    // Didn't throw, so record as used once more:
                    this.usedFormats[i] = formats.replaceSecond(formats.getSecond() + 1);
                    // We only need to sort if we passed the one before us (equal is still fine):
                    if (i > 0 && this.usedFormats[i]!.getSecond() < this.usedFormats[i - 1]!.getSecond())
                        this.usedFormats.sort((a, b) => a.getSecond() - b.getSecond());
                    return possibilities[0]!.getSecond();
                }
                else if (possibilities.length > 1)
                {
                    throw new UserException("Ambiguous date, can be parsed as " + possibilities.map(p => p.getSecond().toString()).join(" or ") + ".  Supply your own format string to disambiguate.");
                }
            }

            // Try other formats:
            for (let index = 0; index < this.unusedFormats.length; index++)
            {
                const formats = this.unusedFormats[index]!;
                const possibilities = this.getPossibles(src, formats);
                if (possibilities.length === 1)
                {
                    // Didn't throw, so record as used:
                    this.unusedFormats.splice(index, 1);
                    // No need to sort; frequency 1 will always be at end of list:
                    this.usedFormats.push(new Pair<readonly DateTimeFormatter[], number>(formats, 1));
                    return possibilities[0]!.getSecond();
                }
                else if (possibilities.length > 1)
                {
                    throw new UserException("Ambiguous date, can be parsed as " + possibilities.map(p => p.getSecond().toString()).join(" or ") + ".  Supply your own format string to disambiguate.");
                }
            }

            throw new UserException("Function " + this.name + " could not parse date/time: \"" + src + "\"");
        }

        private getPossibles(src: string, format: readonly DateTimeFormatter[]): Pair<DateTimeFormatter, TemporalAccessor>[]
        {
            const possibilities: Pair<DateTimeFormatter, TemporalAccessor>[] = [];
            const outer = this.outer;
            const query = new class extends TemporalQuery<TemporalAccessor>
            {
                public override queryFrom(t: JsJodaTemporalAccessor): TemporalAccessor
                {
                    return outer.fromTemporal(t);
                }
            }();
            for (const dateTimeFormatter of format)
            {
                try
                {
                    possibilities.push(new Pair(dateTimeFormatter, dateTimeFormatter.parse(src, query)));
                }
                catch (e)
                {
                    if (!(e instanceof DateTimeParseException))
                        throw e;
                    // Not this one, then...
                }
            }
            return possibilities;
        }
    }

    // Java: inner class FromTemporal
    export class FromTemporal extends FunctionDefinition
    {
        private readonly outer: ToTemporalFunction;

        public constructor(outer: ToTemporalFunction, funcDocKey: FuncDocKey)
        {
            super(funcDocKey);
            this.outer = outer;
        }

        public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
        {
            const outer = this.outer;
            return new class extends ValueFunction
            {
                public override _call(): Value
                {
                    try
                    {
                        return outer.fromTemporal(this.arg(0, ValueClass.TEMPORAL));
                    }
                    catch (e)
                    {
                        if (!isDateTimeException(e))
                            throw e;
                        throw new UserException("Could not convert to date: " + javaMessage(e), e);
                    }
                }
            }();
        }
    }
}

/**
 * Java: arg(index, LocalDate.class) and so on, for a specific java.time class: throws
 * InternalException if the argument is not of the class.
 */
export function temporalArg<T>(v: Value, cls: { prototype: T; name: string }): T
{
    if (!(v instanceof (cls as unknown as abstract new () => T)))
        throw new InternalException("Cannot cast " + javaClassName(v) + " into class java.time." + cls.name);
    return v;
}
