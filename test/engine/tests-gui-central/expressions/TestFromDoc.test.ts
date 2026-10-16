// Port of test.expressions.TestFromDoc (tests-gui-central), which doesn't use the GUI, so it is
// a Vitest engine test here.
//
// PORT-NOTE: Java reads the .test files that the build extracted from the function
// documentation (app/build/resources/main); here they are extracted when the test runs, with
// scripts/funcdoc/funcdoc.mjs (checked against the original stylesheets by Funcdoc.test.ts).
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe } from "vitest";
import { extractTests } from "../../../../scripts/funcdoc/funcdoc.mjs";
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import type { EditableColumn } from "../../../../src/engine/data/data/EditableColumn.js";
import { ColumnUtility } from "../../../../src/engine/data/data/ColumnUtility.js";
import { KnownLengthRecordSet } from "../../../../src/engine/data/data/KnownLengthRecordSet.js";
import type { RecordSet } from "../../../../src/engine/data/data/RecordSet.js";
import { ErrorAndTypeRecorderStorer } from "../../../../src/engine/expressions/transformations/expression/ErrorAndTypeRecorderStorer.js";
import { EvaluateState } from "../../../../src/engine/expressions/transformations/expression/EvaluateState.js";
import { Expression } from "../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { FromString } from "../../../../src/engine/functions/transformations/function/FromString.js";
import { FunctionList } from "../../../../src/engine/functions/transformations/function/FunctionList.js";
import { ColumnId } from "../../../../src/engine/identifiers/id/ColumnId.js";
import { TableId } from "../../../../src/engine/identifiers/id/TableId.js";
import { HashMap } from "../../../../src/engine/java/HashMap.js";
import { javaSplit, javaTrim } from "../../../../src/engine/java/JavaString.js";
import { DataLexer2 } from "../../../../src/engine/parsers/generated/DataLexer2.js";
import { DataParser2 } from "../../../../src/engine/parsers/generated/DataParser2.js";
import { DataType } from "../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../../../src/engine/types/data/datatype/DataTypeValue.js";
import { JellyType } from "../../../../src/engine/types/jellytype/JellyTypes.js";
import { TypeClassRequirements } from "../../../../src/engine/types/typeExp/TypeClassRequirements.js";
import { MutVar, TypeExp } from "../../../../src/engine/types/typeExp/TypeExps.js";
import type { MutUnitVar } from "../../../../src/engine/types/typeExp/units/MutUnitVar.js";
import { Either } from "../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../src/engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../src/engine/utility-error/error/UserException.js";
import { Utility } from "../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../src/engine/utility/utility/Value.js";
import { assertEquals, assertNotNull, assertNull, assertTrue, fail } from "../../../support/junit.js";
import { propertyTest } from "../../../support/quickcheck.js";
import { TFunctionUtil } from "../../tests-functions/fixtures/functions/TFunctionUtil.js";
import { GenValueSpecifiedType } from "../../tests-functions/fixtures/gen/GenValueSpecifiedType.js";
import { GenTypeAndValueGen } from "../../tests-functions/fixtures/gen/type/GenTypeAndValueGen.js";

// Apache Commons' StringUtils.removeStart and removeEnd
function removeStart(s: string, remove: string): string
{
    return remove.length !== 0 && s.startsWith(remove) ? s.substring(remove.length) : s;
}

function removeEnd(s: string, remove: string): string
{
    return remove.length !== 0 && s.endsWith(remove) ? s.substring(0, s.length - remove.length) : s;
}

// Java: FileUtils.readLines, which doesn't give an empty line after a final newline
function readLines(content: string): string[]
{
    const lines = content.split(/\r?\n/u);
    if (lines.length > 0 && lines[lines.length - 1] === "")
        lines.pop();
    return lines;
}

const funcdocDir = join(import.meta.dirname, "..", "..", "..", "..", "resources", "funcdoc");
// The .test files, as the build extracted them (FileUtils.listFiles order is unspecified; sorted here):
const testFiles: [string, string[]][] = readdirSync(funcdocDir).filter(f => f.endsWith(".xml") && f !== "_all.xml").sort()
    .map(f => [f.replace(/\.xml$/, ".test"), readLines(extractTests(join(funcdocDir, f)))] as [string, string[]]).filter(([, lines]) => lines.length > 0);

class DocColumnLookup implements Expression.ColumnLookup
{
    private readonly tables: HashMap<TableId, RecordSet>;

    public constructor(tables: HashMap<TableId, RecordSet>)
    {
        this.tables = tables;
    }

    public getColumn(_expression: Expression, tableId: TableId | null, columnId: ColumnId): Expression.ColumnLookup.FoundColumn | null
    {
        try
        {
            // Java: tables.get(tableId).getColumn(columnId), with any exception (including a
            // NullPointerException for an unknown or null table) meaning not found
            const column = this.tables.get(tableId!)!.getColumn(columnId);
            const type = column.getType();
            return new Expression.ColumnLookup.FoundColumn(tableId!, false, type, null);
        }
        catch
        {
            return null;
        }
    }

    public getTable(tableName: TableId | null): Expression.ColumnLookup.FoundTable | null
    {
        if (tableName === null || !this.tables.has(tableName))
            return null;
        const recordSet = this.tables.get(tableName)!;

        return {
            getTableId(): TableId
            {
                return tableName;
            },

            getColumnTypes(): HashMap<ColumnId, DataTypeValue>
            {
                const columns = new HashMap<ColumnId, DataTypeValue>();
                for (const column of recordSet.getColumns())
                {
                    columns.set(column.getName(), column.getType());
                }
                return columns;
            },

            getRowCount(): number
            {
                return recordSet.getLength();
            },
        };
    }

    public getAvailableColumnReferences(): Pair<TableId | null, ColumnId>[]
    {
        return [];
    }

    public getAvailableTableReferences(): TableId[]
    {
        return [...this.tables.keys()];
    }

    public getPossibleColumnReferences(_tableId: TableId, _columnId: ColumnId): Expression.ColumnLookup.ClickedReference[]
    {
        return []; // Not used here
    }
}

describe("TestFromDoc", () =>
{
    propertyTest("testFromDoc", [new GenValueSpecifiedType(), new GenTypeAndValueGen()], (valueGen: GenValueSpecifiedType.ValueGenerator, typeAndValueGen: GenTypeAndValueGen.TypeAndValueGen) =>
    {
        const typeManager = typeAndValueGen.getTypeManager();
        for (const [, lines] of testFiles)
        {
            // Tables are scoped by file:
            const tables = new HashMap<TableId, RecordSet>();

            for (let i = 0; i < lines.length; i++)
            {
                let line = lines[i]!;
                if (javaTrim(line).length === 0)
                    continue;

                const typeVariables = new Map<string, Either<MutUnitVar, MutVar>>();
                const variables = new Map<string, TypeExp>();
                const minMax = new Map<string, Pair<string, string>>();
                let errorLine = false;
                let typeError = false;

                if (line.startsWith("!!!"))
                {
                    errorLine = true;
                    line = removeStart(line, "!!!");
                }
                else if (line.startsWith("== ") || line.startsWith("==* "))
                {
                    // Hoover up for the variables:
                    while (i < lines.length)
                    {
                        line = lines[i]!;
                        if (line.startsWith("== "))
                        {
                            const nameType = javaSplit(javaTrim(removeStart(line, "== ")), /\/\//u);
                            variables.set(nameType[0]!, JellyType.parse(nameType[1]!, typeManager).makeTypeExp(new Map(typeVariables)));
                            if (nameType.length >= 4)
                                minMax.set(nameType[0]!, new Pair(nameType[2]!, nameType[3]!));

                            i += 1;
                        }
                        else if (line.startsWith("==* "))
                        {
                            const nameType = javaSplit(javaTrim(removeStart(line, "==* ")), /\/\//u);
                            const picked = TypeExp.fromDataType(null, typeAndValueGen.getType());
                            const mutVar = nameType.length === 1 ? new MutVar(null) : new MutVar(null, TypeClassRequirements.require(removeEnd(nameType[1]!, " " + nameType[0]!), ""));
                            typeError = TypeExp.unifyTypes(picked, mutVar).isLeft();
                            typeVariables.set(nameType[0]!, Either.right(mutVar));
                            i += 1;
                        }
                        else
                        {
                            break;
                        }
                    }
                    const lhs = removeStart(lines[i++]!, "==== ");
                    const rhs = removeStart(lines[i]!, "==== ");

                    line = "(" + lhs + ")=(" + rhs + ")";
                }
                else if (line.startsWith("## "))
                {
                    const tableName = javaTrim(removeStart(lines[i]!, "##"));
                    const columnNames = javaSplit(javaTrim(removeStart(lines[++i]!, "##")), /\/\//u);
                    const columnTypes = javaSplit(javaTrim(removeStart(lines[++i]!, "##")), /\/\//u);
                    // Stored as column major:
                    const columnValues: string[][] = Utility.replicateM(columnNames.length, () => [] as string[]);
                    let length = -1;
                    i += 1;
                    while (i < lines.length) // while (true), really -- file shouldn't end that early
                    {
                        line = lines[i]!;
                        if (line.startsWith("#### "))
                        {
                            const values = javaSplit(javaTrim(removeStart(line, "####")), /\/\//u);
                            for (let j = 0; j < values.length; j++)
                            {
                                columnValues[j]!.push(values[j]!);
                            }
                            i += 1;
                        }
                        else
                        {
                            break;
                        }
                    }

                    const columns: ((rs: RecordSet) => EditableColumn)[] = [];
                    for (let c = 0; c < columnNames.length; c++)
                    {
                        const dataType = typeManager.loadTypeUse(columnTypes[c]!);
                        const loadedValues: Either<string, Value>[] = Utility.mapListEx(columnValues[c]!, unparsed => {
                            return Utility.parseAsOne(unparsed, s => new DataLexer2(s), t => new DataParser2(t), p =>
                                DataType.loadSingleItem(dataType, p, false));
                        });
                        if (length === -1)
                            length = loadedValues.length;
                        else if (length !== loadedValues.length)
                            throw new InternalException("Column length mismatch in table data for " + tableName);

                        columns.push(ColumnUtility.makeImmediateColumn(dataType, new ColumnId(columnNames[c]! as ExpressionIdentifier),
                            loadedValues,
                            loadedValues[0]!.getRight("No error")
                        ));
                    }

                    tables.set(new TableId(tableName as ExpressionIdentifier), new KnownLengthRecordSet(columns, length));
                }

                const expression = TFunctionUtil.parseExpression(line, typeManager, FunctionList.getFunctionLookup(typeManager.getUnitManager()));
                const errors = new ErrorAndTypeRecorderStorer();
                let typeState = TFunctionUtil.createTypeState(typeManager);
                for (const [key, value] of variables)
                {
                    const newTypeState = typeState.add(key as ExpressionIdentifier, value, _s => {throw new Error(key + "=" + value.toString());});
                    assertNotNull(newTypeState);
                    if (newTypeState === null) // Won't happen
                        return;
                    typeState = newTypeState;
                }
                const typeExp = expression.checkExpression(new DocColumnLookup(tables), typeState, errors);
                if (!typeError)
                {
                    assertEquals("Errors for " + line, [], errors.getAllErrors());
                    assertNotNull("Type check for " + line, typeExp);
                    if (typeExp === null) continue; // Won't happen
                }
                else
                {
                    assertNull(line + typeState.toString(), typeExp);
                    continue;
                }
                const concreteReturnType = typeExp.toConcreteType(typeManager);
                // It may be a type concretisation error e.g. for minimum([])
                if (!errorLine)
                    assertEquals(line, Either.right(DataType.BOOLEAN), concreteReturnType);

                let evaluateState = new EvaluateState(typeManager, null);
                const varValues: Pair<string, string>[] = [];
                for (const [key, value] of variables)
                {
                    const errorOrType = value.toConcreteType(typeManager);
                    if (errorOrType.isLeft())
                        fail(errorOrType.getLeft("").toString());
                    const concreteVarType = errorOrType.getRight("");
                    let parsedMinMax: Pair<Value, Value> | null = null;
                    const unparsed = minMax.get(key);
                    if (unparsed !== undefined)
                    {
                        parsedMinMax = new Pair(
                            FromString._test_fromString(unparsed.getFirst(), concreteVarType),
                            FromString._test_fromString(unparsed.getSecond(), concreteVarType)
                        );
                    }

                    let v: Value;
                    do
                    {
                        v = valueGen(concreteVarType);
                    }
                    while (parsedMinMax !== null && (Utility.compareValues(parsedMinMax.getFirst(), v) > 0 || Utility.compareValues(parsedMinMax.getSecond(), v) < 0));
                    evaluateState = evaluateState.add(key, v);
                    varValues.push(new Pair(key, DataTypeUtility.valueToString(v)));
                }

                if (errorLine)
                {
                    // Must be user exception
                    try
                    {
                        expression.calculateValue(evaluateState);
                        fail("Expected error but got none for\n" + line);
                    }
                    catch (e)
                    {
                        if (!(e instanceof UserException))
                            throw e;
                        // As expected!
                    }
                }
                else
                {
                    const result = expression.calculateValue(evaluateState).value as boolean;
                    assertTrue(line + " values: " + Utility.listToString(varValues), result);
                }
            }
        }
    }, { trials: 100 });
});
