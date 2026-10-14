// Port of test.TestGenDataType (tests-functions).
import { describe, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { HashSet } from "../../../src/engine/java/HashMap.js";
import { javaEnumValues } from "../../../src/engine/java/JavaEnum.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import type { DataType, DataTypeVisitor, TagType } from "../../../src/engine/types/data/datatype/DataType.js";
import type { TypeId } from "../../../src/engine/types/data/datatype/TypeId.js";
import type { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import type { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { assertEquals } from "../../support/junit.js";
import { GeometricDistribution, SimpleGenerationStatus, SourceOfRandomness } from "../../support/quickcheck.js";
import { GenDataType } from "./fixtures/gen/type/GenDataType.js";

enum Container
{
    TAGGED, RECORD, ARRAY
}

type Nesting = Pair<Container | null, Container | null>;

// Tests that the GenDataType generator is outputting all classes
describe("TestGenDataType", () =>
{
    test("testVarieties", () =>
    {
        // We check that each nested pair occurs.  We start by putting them all in a set, remove if we find them,
        // and any left at the end did not occur:
        const nestings = new HashSet<Nesting>();
        nestings.add(new Pair<Container | null, Container | null>(null, null));
        for (const a of javaEnumValues<Container>(Container))
        {
            for (const b of javaEnumValues<Container>(Container))
            {
                nestings.add(new Pair<Container | null, Container | null>(a, b));
            }
            nestings.add(new Pair<Container | null, Container | null>(a, null));
        }

        const r = new JavaRandom(1n);
        const genDataType = new GenDataType();
        for (let i = 0; i < 1000; i++)
        {
            const sourceOfRandomness = new SourceOfRandomness(r);
            const t = genDataType.generate(sourceOfRandomness, new SimpleGenerationStatus(new GeometricDistribution(), sourceOfRandomness, 10));
            for (const n of calculateNesting(t))
                nestings.delete(n);
        }
        assertEquals(new HashSet<Nesting>(), nestings);
    }, 60000);

    function calculateNesting(t: DataType): Nesting[]
    {
        const visitor: DataTypeVisitor<Nesting[]> = {
            number: () => [new Pair<Container | null, Container | null>(null, null)],
            text: () => [new Pair<Container | null, Container | null>(null, null)],
            date: () => [new Pair<Container | null, Container | null>(null, null)],
            bool: () => [new Pair<Container | null, Container | null>(null, null)],

            tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): Nesting[]
            {
                return tags.flatMap(t => t.getInner() === null ? [] : [t.getInner()!]).flatMap(t => calculateNesting(t)).map(wrap(Container.TAGGED));
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): Nesting[]
            {
                return [...fields.values()].flatMap(calculateNesting).map(wrap(Container.RECORD));
            },

            array(inner: DataType | null): Nesting[]
            {
                if (inner === null)
                    throw new Error("Should not generate null inside array");
                return calculateNesting(inner).map(wrap(Container.ARRAY));
            },
        };
        return t.apply(visitor);
    }

    function wrap(outer: Container): (p: Nesting) => Nesting
    {
        return (p: Nesting) => new Pair<Container | null, Container | null>(outer, p.getFirst());
    }
});
