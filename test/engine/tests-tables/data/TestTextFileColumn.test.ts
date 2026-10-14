// Port of test.data.TestTextFileColumn (tests-tables).
import { describe } from "vitest";
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import { KnownLengthRecordSet } from "../../../../src/engine/data/data/KnownLengthRecordSet.js";
import type { RecordSet } from "../../../../src/engine/data/data/RecordSet.js";
import { TextFileColumn } from "../../../../src/engine/data/data/TextFileColumn.js";
import { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import type { DataType, DataTypeVisitor } from "../../../../src/engine/types/data/datatype/DataType.js";
import type { DateTimeInfo } from "../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import type { NumberInfo } from "../../../../src/engine/types/data/datatype/NumberInfo.js";
import { Either } from "../../../../src/engine/utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../../src/engine/utility-error/error/InternalException.js";
import { IdentifierUtility } from "../../../../src/engine/utility/utility/IdentifierUtility.js";
import { ReadState, Utility } from "../../../../src/engine/utility/utility/Utility.js";
import { propertyTest } from "../../../support/quickcheck.js";
import { TBasicUtil } from "../../tests-basic/fixtures/data/TBasicUtil.js";
import type { GeneratedTextFile } from "../fixtures/data/GeneratedTextFile.js";
import { GenFile } from "../fixtures/gen/GenFile.js";

describe("TestTextFileColumn", () =>
{
    propertyTest("testTextFileColumn", [new GenFile()], (generatedTextFile: GeneratedTextFile) =>
    {
        const recordSet = new KnownLengthRecordSet(
                Utility.mapListExI_Index(generatedTextFile.getColumnTypes(), (i, t) => makeColumn(generatedTextFile, i, t)), generatedTextFile.getLineCount());

        for (let column = 0; column < generatedTextFile.getColumnCount(); column++)
        {
            for (let line = 0; line < generatedTextFile.getLineCount(); line++)
            {
                TBasicUtil.assertValueEqual("Col " + column + " index " + line, generatedTextFile.getExpectedValue(column, line), recordSet.getColumns()[column]!.getType().getCollapsed(line));
            }
        }
    }, { trials: 10, timeout: 120_000 });

    function makeColumn(f: GeneratedTextFile, index: number, dataType: DataType): (rs: RecordSet) => TextFileColumn
    {
        // (Java catches the IOException from making the ReadState, and throws a UserException.)
        const columnName = new ColumnId(IdentifierUtility.identNum("C" as ExpressionIdentifier, index));
        const readState = new ReadState(f.getFile(), f.getCharset(), 0);
        return rs => dataType.apply<TextFileColumn>({
            number: (numberInfo: NumberInfo): TextFileColumn =>
            {
                return TextFileColumn.numericColumn(rs, readState, f.getSeparator(), f.getQuote(), columnName, index, f.getColumnCount(), numberInfo, s => s);
            },

            text: (): TextFileColumn =>
            {
                return TextFileColumn.stringColumn(rs, readState, f.getSeparator(), f.getQuote(), columnName, index, f.getColumnCount());
            },

            date: (dateTimeInfo: DateTimeInfo): TextFileColumn =>
            {
                return TextFileColumn.dateColumn(rs, readState, f.getSeparator(), f.getQuote(), columnName, index, f.getColumnCount(), dateTimeInfo, (s: string) =>
                {
                    return Either.right(dateTimeInfo.fromParsed(dateTimeInfo.getStrictFormatter().parse(s)));
                });
            },

            bool: (): TextFileColumn =>
            {
                throw new InternalException("bool");
            },

            tagged: (): TextFileColumn =>
            {
                throw new InternalException("tagged");
            },

            record: (): TextFileColumn =>
            {
                throw new InternalException("record");
            },

            array: (): TextFileColumn =>
            {
                throw new InternalException("array");
            },
        } satisfies DataTypeVisitor<TextFileColumn>);
    }
});
