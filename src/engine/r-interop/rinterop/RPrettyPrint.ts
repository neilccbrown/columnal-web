// Port of xyz.columnal.rinterop.RPrettyPrint (r-interop module).
import { javaEnumName } from "../../java/JavaEnum.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import { DateTimeInfo } from "../../types/data/datatype/DateTimeInfo.js";
import type { RValue } from "./RValue.js";
import type { RVisitor } from "./RVisitor.js";

export class RPrettyPrint
{
    // Java: prettyPrint(RValue) and private prettyPrint(RValue, StringBuilder, String indent)
    public static prettyPrint(rValue: RValue): string
    {
        const b = { s: "" };
        RPrettyPrint.prettyPrintTo(rValue, b, "");
        return b.s;
    }

    private static prettyPrintTo(rValue: RValue, b: { s: string }, indent: string): void
    {
        // Java's "" + o for an Optional<String> (in limited) gives Optional[x] or Optional.empty
        const optionalToString = (o: unknown): string => typeof o === "string" ? "Optional[" + o + "]" : o === null ? "Optional.empty" : String(o);
        const limited = (values: readonly unknown[]): string => values.slice(0, 3).map(o => "" + optionalToString(o)).join(",");

        rValue.visit(new class implements RVisitor<null>
        {
            public visitNil(): null
            {
                b.s += "<nil>";
                return null;
            }

            public visitString(s: string | null, isSymbol: boolean): null
            {
                b.s += (isSymbol ? "symb" : "") + "\"" + String(s) + "\"";
                return null;
            }

            public visitLogicalList(values: readonly boolean[], isNA: readonly boolean[] | null, attributes: RValue | null): null
            {
                b.s += "boolean[" + values.length + (isNA !== null ? "?" : "");
                if (attributes !== null)
                {
                    b.s += ", attr=";
                    attributes.visit(this);
                }
                b.s += "]";
                return null;
            }

            public visitIntList(values: readonly number[], attributes: RValue | null): null
            {
                b.s += "int[" + values.length + ":" + values.slice(0, 3).map(v => "" + v).join(",");
                if (attributes !== null)
                {
                    b.s += ", attr=";
                    attributes.visit(this);
                }
                b.s += "]";
                return null;
            }

            public visitDoubleList(values: readonly number[], attributes: RValue | null): null
            {
                b.s += "double[" + values.length;
                if (attributes !== null)
                {
                    b.s += ", attr=";
                    attributes.visit(this);
                }
                b.s += "]";
                return null;
            }

            public visitStringList(values: readonly (string | null)[], attributes: RValue | null): null
            {
                b.s += "String[" + values.length + ": " + limited(values);
                if (attributes !== null)
                {
                    b.s += ", attr=";
                    attributes.visit(this);
                }
                b.s += "]";
                return null;
            }

            public visitTemporalList(dateTimeType: DateTimeInfo.DateTimeType, values: readonly (TemporalAccessor | null)[], attributes: RValue | null): null
            {
                b.s += javaEnumName(DateTimeInfo.DateTimeType, dateTimeType) + "[" + values.length;
                if (attributes !== null)
                {
                    b.s += ", attr=";
                    attributes.visit(this);
                }
                b.s += "]";
                return null;
            }

            public visitGenericList(values: readonly RValue[], attributes: RValue | null, isObject: boolean): null
            {
                b.s += isObject ? "object{\n" : "generic{\n";
                for (const value of values)
                {
                    b.s += indent;
                    RPrettyPrint.prettyPrintTo(value, b, indent + "  ");
                    b.s += ",\n";
                }
                if (attributes !== null)
                {
                    b.s += indent;
                    b.s += "attr=";
                    attributes.visit(this);
                    b.s += "\n";
                }
                b.s += indent;
                b.s += "}";
                return null;
            }

            public visitPairList(items: readonly RVisitor.PairListEntry[]): null
            {
                b.s += "pair{";
                for (const value of items)
                {
                    if (value.attributes !== null)
                    {
                        value.attributes.visit(this);
                        b.s += " -> ";
                    }
                    if (value.tag !== null)
                    {
                        b.s += "[";
                        value.tag.visit(this);
                        b.s += "]@";
                    }
                    value.item.visit(this);
                    b.s += ", ";
                }
                b.s += "}";
                return null;
            }

            public visitFactorList(values: readonly number[], levelNames: readonly string[]): null
            {
                b.s += "factor[" + values.length + ", levels=" + levelNames.join(",") + "]";
                return null;
            }
        }());
    }
}
