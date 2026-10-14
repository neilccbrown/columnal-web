// Port of xyz.columnal.loadsave.OutputBuilder (types module).
import type { Vocabulary } from "antlr4ng";
import type { ExpressionIdentifier } from "../../anns/Annotations.js";
import type { ColumnId } from "../../identifiers/id/ColumnId.js";
import type { SaveTag } from "../../identifiers/id/SaveTag.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import { decimalFromDouble, Decimal, toPlainString } from "../../java/JavaBigDecimal.js";
import { IllegalArgumentException } from "../../java/JavaExceptions.js";
import { javaStringCompare } from "../../java/JavaObject.js";
import { MainLexer } from "../../parsers/generated/MainLexer.js";
import { GrammarUtility } from "../../parsers/grammar/GrammarUtility.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import type { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { UnitType } from "../../utility/utility/UnitType.js";
import type { ListEx, Record } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import type { TemporalAccessor } from "../../java/time/TemporalAccessor.js";
import type { DataType, TagType } from "../data/datatype/DataType.js";
import { GetValue, type DataTypeValue } from "../data/datatype/DataTypeValue.js";
import type { DateTimeInfo } from "../data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../data/datatype/NumberInfo.js";
import type { TypeId } from "../data/datatype/TypeId.js";
import type { Unit } from "../data/unit/Unit.js";

/**
 * Created by neil on 09/11/2016.
 */
export class OutputBuilder
{
    // Each outer item is a line; each inner item is a list of tokens to be glued together with whitespace
    private readonly lines: string[][] = [];
    private curLine: string[] | null = null;
    private readonly curLinePrefixStack: string[] = [];

    public constructor()
    {
    }

    // Gets the current line, making a new one if needed
    private cur(): string[]
    {
        if (this.curLine === null)
            this.curLine = [...this.curLinePrefixStack];
        return this.curLine;
    }

    // Outputs a token from given vocab (Java also has t(int token), which uses MainLexer's vocabulary)
    public t(token: number, vocabulary: Vocabulary = vocabularyOf(MainLexer)): OutputBuilder
    {
        const literalName = vocabulary.getLiteralName(token);
        // Awkward to throw an exception here.  Tests should pick this up.
        //if (literalName == null)
        //    throw new InternalException("Unknown token in vocabulary: " + token);
        this.cur().push(OutputBuilder.stripQuotes(literalName!));
        return this;
    }

    public static token(vocabulary: Vocabulary, token: number): string
    {
        const literalName = vocabulary.getLiteralName(token);
        // Awkward to throw an exception here.  Tests should pick this up.
        //if (literalName == null)
        //    throw new InternalException("Unknown token in vocabulary: " + token);
        return OutputBuilder.stripQuotes(literalName!);
    }

    public static stripQuotes(quoted: string): string
    {
        if (quoted.startsWith("'") && quoted.endsWith("'"))
            return quoted.substring(1, quoted.length - 1);
        else
            throw new IllegalArgumentException("Could not remove quotes: <<" + quoted + ">>");
    }

    /**
     * Java has id(TableId) and id(ColumnId), which output the identifier quoted if necessary
     * (QUOTE_SPACES), and id(String, QuoteBehaviour).
     */
    public id(id: TableId | ColumnId | string, quoteBehaviour?: OutputBuilder.QuoteBehaviour): OutputBuilder
    {
        if (typeof id !== "string")
            return this.id(id.getOutput(), OutputBuilder.QuoteBehaviour.QUOTE_SPACES);
        this.cur().push(OutputBuilder.QuoteBehaviour.process(quoteBehaviour!, id));
        return this;
    }

    // Outputs an expression identifier, with no quotes
    public expId(id: ExpressionIdentifier): OutputBuilder
    {
        return this.raw(id);
    }

    // Java has quote(TypeId) and quote(ColumnId)
    public quote(id: TypeId | ColumnId): OutputBuilder
    {
        this.cur().push(OutputBuilder.quoted(id.getOutput()));
        return this;
    }

    // Java has unquoted(TypeId) and unquoted(ColumnId)
    public unquoted(name: TypeId | ColumnId): OutputBuilder
    {
        this.cur().push(name.getRaw());
        return this;
    }

    // Blank the current line.  Used in exception catch blocks
    // to not leave a partially-completed line.
    public undoCurLine(): void
    {
        this.curLine = null;
    }

    /**
     * Outputs a quoted absolute path.
     * PORT-NOTE: Java takes a Path and outputs its absolute path; here the caller passes the path.
     */
    public path(absolutePath: string): OutputBuilder
    {
        this.cur().push(OutputBuilder.quoted(absolutePath));
        return this;
    }

    // Add a newline
    public nl(): OutputBuilder
    {
        this.lines.push(this.cur());
        this.curLine = null;
        return this;
    }

    public static quoted(s: string): string
    {
        // Order matters; escape ^ by itself first:
        return "\"" + GrammarUtility.escapeChars(s) + "\"";
    }

    // Java: private, but used by QuoteBehaviour
    public static quotedIfNecessary(s: string): string
    {
        if (GrammarUtility.validUnquoted(s))
            return s;
        else
            return OutputBuilder.quoted(s);
    }

    public toLines(): string[]
    {
        const finished = this.lines.map(line => line.join(" "));
        if (this.curLine !== null)
            finished.push(this.curLine.join(" "));
        return finished;
    }

    public toString(): string
    {
        let finished = this.lines.map(line => line.join(" ") + "\n").join("");
        if (this.curLine !== null)
            finished += this.curLine.join(" ");
        return finished;
    }

    // Outputs a single value
    public dataValue(type: DataType, value: Value): OutputBuilder
    {
        return this.data(type.fromCollapsed(GetValue.of((_i, _prog) => value)), 0);
    }

    // Outputs an element of an entire data set
    // (Java also has a private overload with nested and alreadyRoundBracketed, here dataNested)
    public data(type: DataTypeValue, index: number): OutputBuilder
    {
        return this.dataNested(type, index, false, false);
    }

    private dataNested(type: DataTypeValue, index: number, nested: boolean, alreadyRoundBracketed: boolean): OutputBuilder
    {
        const curLength = this.cur().length;
        try
        {
            type.applyGet<UnitType>({
                number: (g: GetValue<Decimal>, _displayInfo: NumberInfo): UnitType =>
                {
                    const number = g.get(index);
                    // Java: BigDecimal.toPlainString, or Long.toString
                    this.raw(toPlainString(number));
                    return UnitType.UNIT;
                },

                text: (g: GetValue<string>): UnitType =>
                {
                    this.raw(OutputBuilder.quoted(g.get(index)));
                    return UnitType.UNIT;
                },

                tagged: (typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tagTypes: readonly TagType<DataType>[], g: GetValue<TaggedValue>): UnitType =>
                {
                    const v = g.get(index);
                    const t = tagTypes[v.getTagIndex()]!;
                    const innerType = t.getInner();
                    this.raw(t.getName());
                    if (innerType !== null)
                    {
                        this.raw("(");
                        this.dataNested(innerType.fromCollapsed(GetValue.of((_i, _prog) => {
                            const innerValue = v.getInner();
                            if (innerValue === null)
                                throw new InternalException("Missing inner value required by type: " + typeName.toString() + " tag " + v.getTagIndex());
                            return innerValue;
                        })), 0, true, true);
                        this.raw(")");
                    }
                    return UnitType.UNIT;
                },

                bool: (g: GetValue<boolean>): UnitType =>
                {
                    this.raw(String(g.get(index)));
                    return UnitType.UNIT;
                },

                date: (dateTimeInfo: DateTimeInfo, g: GetValue<TemporalAccessor>): UnitType =>
                {
                    this.raw(dateTimeInfo.getStrictFormatter().format(g.get(index)));
                    return UnitType.UNIT;
                },

                record: (types: ReadonlyMap<ExpressionIdentifier, DataType>, g: GetValue<Record>): UnitType =>
                {
                   if (!alreadyRoundBracketed)
                        this.raw("(");
                    let first = true;
                    const record = g.get(index);
                    for (const [key, value] of [...types].sort((a, b) => javaStringCompare(a[0], b[0])))
                    {
                        if (!first)
                            this.raw(",");
                        first = false;
                        this.id(key, OutputBuilder.QuoteBehaviour.ALWAYS_QUOTE).raw(":");
                        this.dataValue(value, record.getField(key));
                    }
                    if (!alreadyRoundBracketed)
                        this.raw(")");
                    return UnitType.UNIT;
                },

                array: (inner: DataType, g: GetValue<ListEx>): UnitType =>
                {
                    this.raw("[");
                    const details = g.get(index);
                    for (let i = 0; i < details.size(); i++)
                    {
                        if (i > 0)
                            this.raw(",");
                        this.dataNested(inner.fromCollapsed(GetValue.of((j, _prog) => details.get(j))), i, true, false);
                    }
                    this.raw("]");
                    return UnitType.UNIT;
                },
            });
        }
        catch (e)
        {
            if (!(e instanceof InvalidImmediateValueException))
                throw e;
            if (nested)
                throw e;
            // Remove any added output:
            this.cur().splice(curLength);
            this.raw("@INVALID \"" + GrammarUtility.escapeChars(e.getInvalid()) + "\"");
        }
        return this;
    }

    // Don't forget, this will get an extra space added to it as spacing
    public ws(whiteSpace: string): OutputBuilder
    {
        this.cur().push(whiteSpace);
        return this;
    }

    // Outputs the set of lines between @BEGIN/@END tags
    public inner(genDetail: () => readonly string[], saveTag: SaveTag): OutputBuilder
    {
        this.begin().ws(" ").raw(saveTag.getTag()).nl();
        this.pushPrefix(saveTag);
        this.pushIndent();
        for (const line of genDetail())
        {
            this.raw(line).nl();
        }
        this.end().nl();
        this.pop();
        this.pop();
        return this;
    }

    public pop(): void
    {
        this.curLinePrefixStack.pop();
    }

    public pushIndent(): void
    {
        this.curLinePrefixStack.push("");
    }

    public pushPrefix(saveTag: SaveTag): void
    {
        this.curLinePrefixStack.push(saveTag.getTag());
    }

    public begin(): OutputBuilder
    {
        return this.raw("@BEGIN");
    }

    // Outputs the given raw string
    public raw(item: string): OutputBuilder
    {
        this.cur().push(item);
        return this;
    }

    // Adds spacing at the current position
    public indent(): OutputBuilder
    {
        // Second space will be added after:
        return this.ws(" ");
    }

    public end(): OutputBuilder
    {
        return this.raw("@END");
    }

    // Outputs a number (without E-notation)
    public d(number: number): OutputBuilder
    {
        this.cur().push(OutputBuilder.formatF(number));
        return this;
    }

    /**
     * Java's String.format("%f", number): six decimal places, rounding half up from the
     * shortest decimal that represents the double (as Double.toString would give).
     */
    private static formatF(number: number): string
    {
        if (Number.isNaN(number))
            return "NaN";
        if (!Number.isFinite(number))
            return number > 0 ? "Infinity" : "-Infinity";
        const s = decimalFromDouble(number).toFixed(6, Decimal.ROUND_HALF_UP);
        return Object.is(number, -0) || (number < 0 && !s.startsWith("-")) ? "-" + s : s;
    }

    // Outputs an arbitrary keyword
    public kw(keyword: string): OutputBuilder
    {
        return this.raw(keyword);
    }

    public s(string: string): void
    {
        this.cur().push(OutputBuilder.quoted(string));
    }

    public unit(s: string): OutputBuilder
    {
        this.cur().push("{" + s + "}");
        return this;
    }

    public n(n: number | bigint): OutputBuilder
    {
        this.cur().push(n.toString());
        return this;
    }
}

export namespace OutputBuilder
{
    export enum QuoteBehaviour
    {
        ALWAYS_QUOTE, QUOTE_SPACES, DEFAULT
    }

    export namespace QuoteBehaviour
    {
        export function process(behaviour: QuoteBehaviour, original: string): string
        {
            switch (behaviour)
            {
                case QuoteBehaviour.ALWAYS_QUOTE:
                    return OutputBuilder.quoted(original);
                case QuoteBehaviour.QUOTE_SPACES:
                    if (original.includes(" "))
                        return OutputBuilder.quoted(original);
                    else
                        return OutputBuilder.quotedIfNecessary(original);
                default:
                    return OutputBuilder.quotedIfNecessary(original);
            }
        }
    }
}
