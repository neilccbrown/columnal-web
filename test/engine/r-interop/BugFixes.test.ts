// Tests for Java bugs that the port fixes (each marked with a PORT-NOTE in the source).
import { describe, expect, test } from "vitest";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { ConvertFromR } from "../../../src/engine/r-interop/rinterop/ConvertFromR.js";
import { RUtility } from "../../../src/engine/r-interop/rinterop/RUtility.js";
import type { RValue } from "../../../src/engine/r-interop/rinterop/RValue.js";
import type { RVisitor } from "../../../src/engine/r-interop/rinterop/RVisitor.js";
import type { JellyType } from "../../../src/engine/types/jellytype/JellyTypes.js";
import { TagType } from "../../../src/engine/types/data/datatype/DataType.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";

describe("Java bug fixes", () =>
{
    // Java's ConvertFromR.getTaggedTypeForFactors tried the same type name 100 times, so a factor
    // couldn't be imported if a type with that name but different tags already existed.
    test("factor whose type name is taken", () =>
    {
        const typeManager = new TypeManager(new UnitManager());
        typeManager.registerTaggedType("a 2" as ExpressionIdentifier, [], [new TagType<JellyType>("a" as ExpressionIdentifier, null), new TagType<JellyType>("c" as ExpressionIdentifier, null)]);
        const factor: RValue = {
            visit<T>(visitor: RVisitor<T>): T
            {
                return visitor.visitFactorList([1, 2, 1], ["a", "b"]);
            },
        };
        const converted = ConvertFromR.convertRToTypedValueList(typeManager, factor);
        expect(converted.getFirst().toString()).toBe("a 2 1 <a | b>");
        expect(converted.getSecond().length).toBe(3);
    });

    // Java's RUtility.dateVector put a time before 1970 with a fraction of a second out by twice
    // that fraction.  (These are the times R gives for these numbers of days.)
    test.each([
        [-0.25 / 86400, "1969-12-31T23:59:59.750"],
        [-1.5 / 86400, "1969-12-31T23:59:58.500"],
        [-2.75 / 86400, "1969-12-31T23:59:57.250"],
    ])("date-time of %d days", (days, expected) =>
    {
        const converted = ConvertFromR.convertRToTypedValueList(new TypeManager(new UnitManager()), RUtility.dateVector([days], null));
        expect(String(converted.getSecond()[0])).toBe(expected);
    });
});
