// Port of test.gen.GenFormattedData (tests-gui-format testFixtures).
import { BlankColumnType, CleanDateColumnType, NumericColumnType, TextColumnType } from "../../../../../src/engine/data/data/columntype/ColumnTypes.js";
import { javaReplace, NumberFormatException } from "../../../../../src/engine/java/JavaString.js";
import { parseBigDecimal, decimalFromBigInt } from "../../../../../src/engine/java/JavaBigDecimal.js";
import { isWhitespace } from "../../../../../src/engine/java/JavaCharacter.js";
import { escapeHtml4 } from "../../../../../src/engine/java/StringEscapeUtils.js";
import { LocalDate } from "../../../../../src/engine/java/time/JavaTime.js";
import { GuessFormat } from "../../../../../src/engine/importers/importers/GuessFormat.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import { canEncode } from "../../../../support/charsets.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenFormat } from "./GenFormat.js";

// Java's String.format("%,d", n) in an English locale: digits grouped in threes with commas
function groupThousands(n: bigint): string
{
    const digits = (n < 0n ? -n : n).toString();
    let grouped = "";
    for (let i = 0; i < digits.length; i++)
    {
        if (i > 0 && (digits.length - i) % 3 === 0)
            grouped += ",";
        grouped += digits.charAt(i);
    }
    return (n < 0n ? "-" : "") + grouped;
}

// Java's String.format("%0" + width + "d", n)
function zeroPad(n: number, width: number): string
{
    const digits = String(Math.abs(n)).padStart(n < 0 ? width - 1 : width, "0");
    return (n < 0 ? "-" : "") + digits;
}

// Java's String.isBlank(): empty, or only whitespace (Character.isWhitespace)
function isBlank(s: string): boolean
{
    for (const ch of s)
    {
        if (!isWhitespace(ch.codePointAt(0)!))
            return false;
    }
    return true;
}

/**
 * Created by neil on 23/12/2016.
 */
export class GenFormattedData extends Generator<GenFormattedData.FormatAndData>
{
    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): GenFormattedData.FormatAndData
    {
        const fileContent: string[] = [];
        const intendedContent: Value[][] = [];
        const format = new GenFormat().generate(r, generationStatus);

        let htmlContent = "<html><head><title>Testing!</title></head><body><table>";

        fileContent.push(format.columnTypes.map(c => c.title.getOutput()).join("" + String(format.initialTextFormat.separator)));
        htmlContent += "<tr><th>" + format.columnTypes.map(c => c.title.getOutput()).join("</th><th>") + "</th></tr>";
        const rowCount = r.nextInt(50, 200);
        const columnsWithSingleValue: number[] = [];
        for (let row = 0; row < rowCount; row++)
        {
            const data: Value[] = [];
            let line = "";
            htmlContent += "<tr>";
            const columnTypes = format.columnTypes;
            for (let i = 0; i < columnTypes.length; i++)
            {
                // TODO generate X-or-blank column types
                const c = columnTypes[i]!;
                // TODO add random spaces, randomise content using generators

                let entry = "";

                if (c.type instanceof NumericColumnType)
                {
                    const numericColumnType = c.type;
                    if (!canEncode(format.initialTextFormat.charset, numericColumnType.unit.getDisplayPrefix()))
                        throw new Error("Cannot encode prefix: " + numericColumnType.unit.getDisplayPrefix());
                    entry += r.nextBoolean() ? "" : numericColumnType.unit.getDisplayPrefix();
                    const value = r.nextLong();

                    entry += "," === format.initialTextFormat.separator ? value.toString() : groupThousands(value);
                    if (numericColumnType.displayInfo.getMinimumDP() > 0)
                    {
                        // Java: Math.abs(r.nextInt()), which is negative for Integer.MIN_VALUE
                        const next = r.nextInt();
                        const decimalDigs = zeroPad(next === -2147483648 ? next : Math.abs(next), numericColumnType.displayInfo.getMinimumDP()).substring(0, numericColumnType.displayInfo.getMinimumDP());
                        entry += "." + decimalDigs;
                        data.push(DataTypeUtility.value(parseBigDecimal(value.toString() + "." + decimalDigs, false)));
                    }
                    else
                        data.push(DataTypeUtility.value(decimalFromBigInt(value)));
                    entry += r.nextBoolean() ? "" : numericColumnType.unit.getDisplaySuffix();
                }
                else if (c.type instanceof TextColumnType)
                {
                    if (row === 0 && r.nextInt(8) === 1)
                        columnsWithSingleValue.push(i);

                    let str: string;
                    if (columnsWithSingleValue.includes(i) && row > 0)
                    {
                        str = String(intendedContent[0]![i]);
                    }
                    else
                    {
                        str = javaReplace(javaReplace(TBasicUtil.makeString(r, generationStatus), "\n", ""), "\r", "");
                        // Get rid of any characters which can't be saved in that encoding:
                        // (Java tests each char on its own, so a surrogate pair is removed too)
                        str = [...str.split("")].filter(ch => canEncode(format.initialTextFormat.charset, ch)).join("");
                        // TODO quote separators instead of removing them:
                        if (format.initialTextFormat.quote !== null)
                            str = javaReplace(str, format.initialTextFormat.quote, format.initialTextFormat.quote + format.initialTextFormat.quote);
                        if (format.initialTextFormat.separator !== null)
                            str = javaReplace(str, format.initialTextFormat.separator, "");

                        // Check that the string isn't blank, otherwise we'll think it's a blank column:
                        if (isBlank(str))
                        {
                            str = "oh no string was blank";
                        }

                        // Check that the string isn't a number, otherwise we'll think it's a numeric column:
                        try
                        {
                            parseBigDecimal(str, false);
                            // Oh dear, it parsed, replace it with something:
                            str = "oh dear my original idea parsed as a number";
                        }
                        catch (e)
                        {
                            if (!(e instanceof NumberFormatException))
                                throw e;
                            // Won't parse, that's fine then
                        }

                    }
                    data.push(DataTypeUtility.value(str));
                    entry += str;
                }
                else if (c.type instanceof CleanDateColumnType)
                {
                    const dateColumnType = c.type;
                    let year: number;
                    if (dateColumnType.isShortYear())
                        year = 1950 + r.nextInt(84); // Might need to adjust this in 2030
                    else
                        year = 1900 + r.nextInt(199);
                    const month = 1 + r.nextInt(12);
                    const day = 1 + r.nextInt(28);
                    const date = LocalDate.of(year, month, day);
                    data.push(date);

                    entry += date.format(dateColumnType.getDateTimeFormatter());
                }
                else if (c.type instanceof BlankColumnType)
                {
                    data.push(DataTypeUtility.value(""));
                }
                else
                    throw new Error("UnsupportedOperationException: Missing case for column columntype? " + c.type.constructor.name);
                line += entry;
                if (i < columnTypes.length - 1)
                    line += String(format.initialTextFormat.separator);

                // <pre> to preserve whitespace and deal with awkward characters:
                // PORT-NOTE: bug fix (test only).  Java used escapeHtml4 as it is, whose &lang; and
                // &rang; (U+2329 and U+232A in HTML 4) are U+27E8 and U+27E9 in HTML5, as jsoup reads
                // them, so a value with one of those characters was read back differently.  Here
                // they are written as numeric references, which mean the same in both.
                htmlContent += "<td><pre>" + escapeHtml4(entry).replaceAll("&lang;", "&#9001;").replaceAll("&rang;", "&#9002;") + "</pre></td>";
            }

            htmlContent += "</tr>\n";
            const lineString = line;
            // Don't add all-blank rows because they weren't intentional and it can screw up guess:
            if (javaReplace(lineString, String(format.initialTextFormat.separator), "") !== "")
            {
                fileContent.push(lineString);
                intendedContent.push(data);
            }
        }

        if (r.nextBoolean())
            fileContent.push(""); // Add trailing newline

        // Strip blanks from beginning and end as trim should now remove them:
        const withoutBlanks = [...format.columnTypes];
        let leftTrim = 0;
        while (withoutBlanks.length > 0 && withoutBlanks[0]!.type instanceof BlankColumnType)
        {
            withoutBlanks.shift();
            leftTrim += 1;
        }
        let rightTrim = 0;
        while (withoutBlanks.length > 0 && withoutBlanks[withoutBlanks.length - 1]!.type instanceof BlankColumnType)
        {
            withoutBlanks.pop();
            rightTrim += 1;
        }

        if (leftTrim !== 0 || rightTrim !== 0)
        {
            for (let i = 0; i < intendedContent.length; i++)
            {
                const row = intendedContent[i]!;
                intendedContent[i] = row.slice(leftTrim, row.length - rightTrim);
            }
        }

        htmlContent += "</table></body></html>";

        const trim = new GuessFormat.TrimChoice(format.trimChoice.trimFromTop, format.trimChoice.trimFromBottom, format.trimChoice.trimFromLeft + leftTrim, format.trimChoice.trimFromRight + rightTrim);
        return new GenFormattedData.FormatAndData(new GuessFormat.FinalTextFormat(format.initialTextFormat, trim, withoutBlanks), fileContent, htmlContent, intendedContent);
    }

}

export namespace GenFormattedData
{
    export class FormatAndData
    {
        public readonly format: GuessFormat.FinalTextFormat;
        public readonly textContent: readonly string[];
        public readonly htmlContent: string;
        // Outermost list is list of rows
        // Next list in is list of columns.
        public readonly loadedContent: readonly (readonly Value[])[];

        public constructor(format: GuessFormat.FinalTextFormat, textContent: readonly string[], htmlContent: string, loadedContent: readonly (readonly Value[])[])
        {
            this.format = format;
            this.textContent = textContent;
            this.htmlContent = htmlContent;
            this.loadedContent = loadedContent;
        }

        public toString(): string
        {
            return "FormatAndData{" +
                "format=" + this.format.toString() +
                /*", content=" + content +
                ", loadedContent=" + loadedContent +*/
                "}";
        }
    }
}
