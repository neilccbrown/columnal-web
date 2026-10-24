// Tests for Java bugs in the app module's logic that the port fixes (each marked with a PORT-NOTE
// in the source).
import { describe, expect, test } from "vitest";
import { FunctionList } from "../../../src/engine/functions/transformations/function/FunctionList.js";
import { Decimal } from "../../../src/engine/java/JavaBigDecimal.js";
import { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { TaggedValue } from "../../../src/engine/utility/utility/TaggedValue.js";
import { AppUtility } from "../../../src/gui-logic/app/apputility/AppUtility.js";
import { TFunctionUtil } from "../../engine/tests-functions/fixtures/functions/TFunctionUtil.js";

describe("Java bug fixes", () =>
{
    // Java's valueToExpression gave a tagged value of a type with type variables "as type" with a
    // list of its type, so (for example) unwrapping an Optional column whose inner type was itself
    // Optional, with a default value, made a Calculate with a type error.
    test("valueToExpression of a tagged value with type variables", () =>
    {
        const mgr = TFunctionUtil.managerWithTestTypes().getFirst();
        const typeManager = mgr.getTypeManager();
        const optionalNumber = typeManager.getMaybeType().instantiate([Either.right(DataType.NUMBER)], typeManager);
        const expression = AppUtility.valueToExpression(typeManager, FunctionList.getFunctionLookup(mgr.getUnitManager()), optionalNumber, new TaggedValue(1, new Decimal(5), typeManager.getMaybeType()));
        const type = expression.checkExpression(TFunctionUtil.dummyColumnLookup(), TFunctionUtil.createTypeState(typeManager), TFunctionUtil.excOnError());
        expect(type!.toConcreteType(typeManager).either(_e => null, t => t)!.equals(optionalNumber)).toBe(true);
    });
});
