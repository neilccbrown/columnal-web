// Port of test.data.GeneratedTextFile (tests-tables testFixtures).
import type { Charset } from "../../../../../src/engine/java/JavaCharset.js";
import type { JavaFile } from "../../../../../src/engine/java/JavaFile.js";
import type { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";

/**
 * Created by neil on 26/10/2016.
 */
export class GeneratedTextFile
{
    private readonly file: JavaFile;
    private readonly charset: Charset;
    private readonly lineCount: number;
    private readonly separator: string;
    private readonly quote: string;
    private readonly columnTypes: readonly DataType[];
    // Each item in outer list is a column.
    private readonly expectedColumns: readonly (readonly Value[])[];

    public constructor(file: JavaFile, charset: Charset, lineCount: number, separator: string, quote: string, columnTypes: readonly DataType[], expectedColumns: readonly (readonly Value[])[])
    {
        this.file = file;
        this.charset = charset;
        this.lineCount = lineCount;
        this.separator = separator;
        this.quote = quote;
        this.columnTypes = columnTypes;
        this.expectedColumns = expectedColumns;
    }

    public getFile(): JavaFile
    {
        return this.file;
    }

    public getLineCount(): number
    {
        return this.lineCount;
    }

    public toString(): string
    {
        return "GeneratedTextFile{" +
            "charset=" + this.charset.toString() +
            ", lineCount=" + this.lineCount +
            ", separator='" + this.separator + "'" +
            ", quote='" + this.quote + "'" +
            "}";
    }

    public getCharset(): Charset
    {
        return this.charset;
    }

    public getSeparator(): string
    {
        return this.separator;
    }

    public getQuote(): string
    {
        return this.quote;
    }

    public getColumnTypes(): readonly DataType[]
    {
        return this.columnTypes;
    }

    public getColumnCount(): number
    {
        return this.columnTypes.length;
    }

    public getExpectedValue(column: number, line: number): Value
    {
        return this.expectedColumns[column]![line]!;
    }
}
