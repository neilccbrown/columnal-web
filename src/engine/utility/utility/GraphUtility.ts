// Port of xyz.columnal.utility.GraphUtility (utility module).
import { HashMap, HashSet, type ReadonlyMapLike } from "../../java/HashMap.js";
import { javaEquals } from "../../java/JavaObject.js";

/**
 * Created by neil on 21/11/2016.
 */
export class GraphUtility
{
    /**
     * Collapses a directed acyclic graph into a linear list of nodes, such that all edges
     * point forwards in the list.  The nodes in putAsLateAsPossible are put as late in the list
     * as possible (if there are multiple orderings available).
     *
     * @param nodes The full set of nodes in the graph, which will be returned, but maybe in a different order
     * @param incomingEdges A map from a node to its list of *incoming* edges.  Nodes with no incoming may be absent or map to an empty list.
     * @param putAsLateAsPossible See above
     * @param <T> The node type.  Nodes are compared using .equals
     * @return The flattened ordered list of nodes.
     */
    public static lineariseDAG<T>(nodes: Iterable<T>, incomingEdges: ReadonlyMapLike<T, Iterable<T>>, putAsLateAsPossible: readonly T[]): T[]
    {
        // Kahn's algorithm, from wikipedia:
        //   L ← Empty list that will contain the sorted elements
        //   S ← Set of all nodes with no incoming edges
        //   while S is non-empty do
        //     remove a node n from S
        //     add n to tail of L
        //     for each node m with an edge e from n to m do
        //        remove edge e from the graph
        //        if m has no other incoming edges then
        //           insert m into S

        // We don't have any empty lists in the map:
        // PORT-NOTE: Java iterates this HashMap in hash order below, which affects which of the
        // valid orderings is returned (and so, for example, the order of tables in a saved
        // file), so it simulates Java's hash order.
        const remainingEdges = HashMap.javaOrder<T, HashSet<T>>();
        incomingEdges.forEach((value, key) =>
        {
            const edges = new HashSet(value);
            if (edges.size !== 0)
                remainingEdges.set(key, edges);
        });

        const l: T[] = [];
        // Has an incoming edge; shouldn't be in s:
        const s: T[] = [...nodes].filter(t => !remainingEdges.has(t));

        while (s.length !== 0)
        {
            let next: T | undefined = undefined;
            let found = false;
            // Faster to remove from end:
            for (let i = s.length - 1; i >= 0; i--)
            {
                if (!putAsLateAsPossible.some(x => javaEquals(x, s[i])))
                {
                    next = s.splice(i, 1)[0];
                    found = true;
                    break;
                }
            }
            // Have to take a late one:
            if (!found)
                next = s.pop(); // Faster to remove from end
            l.push(next as T);

            for (const [key, incoming] of [...remainingEdges.entries()])
            {
                incoming.delete(next as T);
                if (incoming.size === 0)
                {
                    s.push(key);
                    remainingEdges.delete(key);
                }
            }
        }
        return l;
    }
}
