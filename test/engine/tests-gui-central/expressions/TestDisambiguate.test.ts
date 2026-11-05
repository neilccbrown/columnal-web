// Port of test.expressions.TestDisambiguate (tests-gui-central), which doesn't use the GUI, so it is a
// Vitest engine test here.
import { describe, test } from "vitest";
import type { ExpressionIdentifier } from "../../../../src/engine/anns/Annotations.js";
import { Expression } from "../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { Pair } from "../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { assertEquals } from "../../../support/junit.js";

type SaveDestination = Expression.SaveDestination;

describe("TestDisambiguate", () =>
{
    test("simpleLocal", () =>
    {
        const d = makeNames(local("local1"));
        assertEquals("local2", t(d, local("local2")));
        assertEquals("local1", t(d, local("local1")));
    });

    test("localsAndColumns", () =>
    {
        // Non-conflicting:
        const d = makeNames(local("x"), local("y"),
            column("col1"), column("col2"), column("tab1", "col2"), column("tab1", "col3"),
            table("tab1"), table("y"));

        assertEquals("x", t(d, local("x")));
        assertEquals("col1", t(d, local("col1")));
        assertEquals("col1", t(d, column("col1")));
        assertEquals("col2", t(d, local("col2")));
        assertEquals("col2", t(d, column("col2")));
        assertEquals("tab1\\col2", t(d, column("tab1", "col2")));
        // Remember that now we use table references for whole columns, a column reference always refers to one of the sources:
        assertEquals("col3", t(d, column("tab1", "col3")));
        assertEquals("tab1", t(d, table("tab1")));
        assertEquals("table\\\\y", t(d, table("y")));
        assertEquals("y", t(d, local("y")));
    });
});

interface Name
{
    readonly namespace: ExpressionIdentifier | null;
    readonly names: readonly ExpressionIdentifier[];
}

function n(namespace: string | null, ...names: string[]): Name
{
    return { namespace: namespace as ExpressionIdentifier | null, names: names as ExpressionIdentifier[] };
}

function local(name: string): Name
{
    return n(null, name);
}

// Java: column(columnNoTable) and column(table, column)
function column(...tableAndColumn: [string] | [string, string]): Name
{
    return n("column", ...tableAndColumn);
}

function table(table: string): Name
{
    return n("table", table);
}

function makeNames(...names: Name[]): SaveDestination
{
    return new Expression.SaveDestination.ToEditor(names.map(n => new Pair(n.namespace, n.names)));
}

function t(destination: SaveDestination, name: Name): string
{
    const result = destination.disambiguate(name.namespace, name.names);
    return (result.getFirst() !== null ? result.getFirst()! + "\\\\" : "") + result.getSecond().join("\\");
}
