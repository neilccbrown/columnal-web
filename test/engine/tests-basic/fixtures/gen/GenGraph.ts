// Port of test.gen.GenGraph (tests-basic testFixtures).
import { HashMap } from "../../../../../src/engine/java/HashMap.js";
import { javaShuffle } from "../../../../../src/engine/java/JavaCollections.js";
import type { ReadonlyMapLike } from "../../../../../src/engine/java/HashMap.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";

/**
 * Created by neil on 21/11/2016.
 */
export class GenGraph extends Generator<GenGraph.Graph>
{
    public override generate(r: SourceOfRandomness, _generationStatus: GenerationStatus): GenGraph.Graph
    {
        const numNodes = r.nextInt(0, 20);
        // Max edges in DAG is numNodes * (numNodes - 1) / 2
        // Each node can link to all those before it.
        let numEdges = r.nextInt(0, numNodes * (numNodes - 1) / 2);
        // Keep it on the sparse side by taking lower of two picks:
        numEdges = Math.min(numEdges, r.nextInt(0, numNodes * (numNodes - 1) / 2));
        const nodes: object[] = [];
        for (let i = 0; i < numNodes; i++)
            nodes.push({}); // Java: new Object()

        const possibleEdges: Pair<object, object>[] = [];
        for (let i = 0; i < numNodes; i++)
            for (let j = 0; j < i; j++)
            {
                // Duplicate each edge to test the algorithm for that case:
                for (let k = 0; k < 3; k++)
                {
                    possibleEdges.push(new Pair(nodes[j]!, nodes[i]!));
                }
            }

        const edges = new HashMap<object, object[]>();
        for (const node of nodes)
            edges.set(node, []);

        // To pick the edges, we shuffle all possible edges and chop:
        javaShuffle(possibleEdges, r.toJDKRandom());
        for (let i = 0; i < numEdges; i++)
            // Remember, it's a map from destination to source:
            edges.get(possibleEdges[i]!.getSecond())!.push(possibleEdges[i]!.getFirst());

        // Pick late by shuffling and picking:
        javaShuffle(nodes, r.toJDKRandom());
        const numLate = r.nextInt(0, Math.min(3, numNodes));
        const late = nodes.slice(0, numLate);
        // Shuffle the nodes to make sure algorithm doesn't just use our ordering:
        javaShuffle(nodes, r.toJDKRandom());

        return new GenGraph.Graph(nodes, edges, late);
    }
}

export namespace GenGraph
{
    export class Graph
    {
        public constructor(
            public nodes: unknown[],
            public incoming: ReadonlyMapLike<unknown, unknown[]>,
            public late: unknown[])
        {
        }
    }
}
