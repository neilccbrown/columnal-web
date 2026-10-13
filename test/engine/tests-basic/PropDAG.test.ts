// Port of test.PropDAG (tests-basic).
import { describe, test } from "vitest";
import { HashSet, type ReadonlyMapLike } from "../../../src/engine/java/HashMap.js";
import { javaEquals } from "../../../src/engine/java/JavaObject.js";
import { GraphUtility } from "../../../src/engine/utility/utility/GraphUtility.js";
import { assertThat, Matchers } from "../../support/hamcrest.js";
import { assertEquals, assertNotEquals, assertTrue } from "../../support/junit.js";
import { propertyTest } from "../../support/quickcheck.js";
import { GenGraph } from "./fixtures/gen/GenGraph.js";

/**
 * Created by neil on 21/11/2016.
 */
function indexOf(list: readonly unknown[], item: unknown): number
{
    return list.findIndex(x => javaEquals(x, item));
}

function checkSameContent(a: readonly unknown[], b: readonly unknown[]): void
{
    assertEquals(a.length, b.length);
    assertEquals(new HashSet(a), new HashSet(b));
}

function checkGraphLinear(g: GenGraph.Graph, linear: readonly unknown[]): void
{
    assertEquals(linear.length, g.nodes.length);
    assertEquals(new HashSet(linear), new HashSet(g.nodes));
    // Check that all incoming links are from objects behind us:
    for (let i = 0; i < linear.length; i++)
    {
        for (const from of g.incoming.get(linear[i]) ?? [])
        {
            // Our index must be beyond that of all incoming nodes:
            assertThat(i, Matchers.greaterThan(indexOf(linear, from)));
        }
    }
}

// This test ignores late and does it without them:
function propLinearise(g: GenGraph.Graph): void
{
    const linear = GraphUtility.lineariseDAG(g.nodes, g.incoming, []);
    checkGraphLinear(g, linear);
    checkSameContent(g.nodes, linear);
}

// This property checks that late is obeyed:
function propLineariseLateness(g: GenGraph.Graph): void
{
    const linear = GraphUtility.lineariseDAG(g.nodes, g.incoming, g.late);
    checkGraphLinear(g, linear);
    checkSameContent(g.nodes, linear);

    if (g.late.length !== 0)
    {
        // Also check late nodes.
        // They should be as late as possible, which means all nodes which follow
        // a late node should have a transitive incoming edge from a late node.
        const firstLate = Math.min(...g.late.map(i => indexOf(linear, i)));
        assertNotEquals(-1, firstLate);
        // Everything after first late must be late, have a link from late, or some linked node.
        // So we go through in order, checking each one and adding to validSources:
        const validSources: unknown[] = [...g.late];
        for (let i = firstLate; i < linear.length; i++)
        {
            const n = linear[i];
            if (indexOf(g.late, n) !== -1)
            {
                // It's late itself; fine
            }
            else
            {
                // Must have as a source one of validSources:
                const inc = g.incoming.get(n);
                assertTrue(inc !== undefined && inc.some(x => indexOf(validSources, x) !== -1));
            }
            validSources.push(n);
        }
    }
}

function graph(nodes: string[], incoming: [string, string[]][], late: string[]): GenGraph.Graph
{
    return new GenGraph.Graph(nodes, new Map(incoming) as ReadonlyMapLike<unknown, unknown[]>, late);
}

describe("PropDAG", () =>
{
    propertyTest("propLinearise", [new GenGraph()], g => propLinearise(g), { trials: 500 });

    propertyTest("propLineariseLateness", [new GenGraph()], g => propLineariseLateness(g), { trials: 500 });

    test("testSpecific", () =>
    {
        propLinearise(graph(["A", "B", "BL", "C", "EK", "ENU", "JR", "Nested", "VQ"], [["VQ", ["BL"]], ["JR", ["BL", "BL"]]], []));
    });

    test("testSpecificLate", () =>
    {
        propLineariseLateness(graph(["T2", "T9", "T6", "A", "S", "P", "E", "m"], [["m", ["T9"]], ["S", ["T6", "E"]], ["T2", ["A"]], ["T9", ["T2", "S", "P"]]], ["T2"]));
        propLineariseLateness(graph(["T2", "T9", "T6", "A", "S", "P", "E", "m"], [
            ["T2", ["T9"]],
            ["T9", ["m"]],
            ["T6", ["S"]],
            ["A", ["T2"]],
            ["S", ["T9"]],
            ["P", ["T9"]],
            ["E", ["S"]],
        ], []));
        propLineariseLateness(graph(["T 216378", "T 963337", "T 663438", "Averages For Filtered", "Summary Per Participant", "Per Frequency All Participants", "Excluded Participants On Accuracy", "merged flagbadnonwords fixdupe25"], [
            ["T 216378", ["T 963337"]],
            ["T 963337", ["merged flagbadnonwords fixdupe25"]],
            ["T 663438", ["Summary Per Participant"]],
            ["Averages For Filtered", ["T 216378"]],
            ["Summary Per Participant", ["T 963337"]],
            ["Per Frequency All Participants", ["T 963337"]],
            ["Excluded Participants On Accuracy", ["Summary Per Participant"]],
        ], []));
    });
});
