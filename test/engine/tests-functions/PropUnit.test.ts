// Port of test.PropUnit (tests-functions).
import { describe, test } from "vitest";
import type { Unit } from "../../../src/engine/types/data/unit/Unit.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { MutUnitVar } from "../../../src/engine/types/typeExp/units/MutUnitVar.js";
import { UnitExp } from "../../../src/engine/types/typeExp/units/UnitExp.js";
import { InternalException } from "../../../src/engine/utility-error/error/InternalException.js";
import { UserException } from "../../../src/engine/utility-error/error/UserException.js";
import { AssertionFailedError, assertEquals, assertNotNull, fail } from "../../support/junit.js";
import { propertyTest } from "../../support/quickcheck.js";
import { GenUnit } from "../tests-basic/fixtures/gen/GenUnit.js";

/**
 * Created by neil on 24/01/2017.
 */
describe("PropUnit", () =>
{
    // Java: an instance field, made for each test
    const makeMgr = (): UnitManager => new UnitManager();

    propertyTest("propUnits", [new GenUnit(), new GenUnit()], (a: Unit, b: Unit) =>
    {
        const mgr = makeMgr();
        assertEquals(a.equals(b), b.equals(a));
        const ba = b.canScaleTo(a, mgr);
        assertEquals(a.canScaleTo(b, mgr), ba === null ? null : ba.reciprocal());
        assertEquals(a, a.reciprocal().reciprocal());
        assertEquals(b, b.reciprocal().reciprocal());
        assertEquals(a.divideBy(b), b.divideBy(a).reciprocal());
        assertEquals(a.times(b), a.divideBy(b.reciprocal()));
        assertEquals(a, a.divideBy(b).times(b));
        assertEquals(a, a.times(b).divideBy(b));
        for (let i = 1; i < 10; i++)
            assertEquals(a, a.raisedTo(i).rootedBy(i));
    });

    test("testTypecheckUnitTimes", () =>
    {
        const mgr = makeMgr();
        const unit = (u: string): Unit => mgr.loadUse(u);
        const unitExp = (u: string): UnitExp => UnitExp.fromConcrete(unit(u));

        withMut(u => {
            unify(unitExp("m"), times(u, unitExp("m/s")));
            assertEquals(unit("s"), u.toConcreteUnit());
        });

        withMut(u => {
            unify(unitExp("m"), times(u, UnitExp.SCALAR));
            assertEquals(unit("m"), u.toConcreteUnit());
        });

        withMut(u => {
            unify(u.raisedTo(4), times(unitExp("m^3/s"), unitExp("m/s^3")));
            assertEquals(unit("m/s"), u.toConcreteUnit());
        });

        withMut(u => {
            unify(u.raisedTo(2), times(unitExp("m^3/s"), unitExp("m/s^3")));
            assertEquals(unit("m^2/s^2"), u.toConcreteUnit());
        });

        withMut(u => withMut(u3 => {
            // Test that an ambiguous resolution, followed by clarifier, gives right result:
            unify(u.times(u3.raisedTo(3)), times(unitExp("m^3/s"), unitExp("m/s^3")));
            unify(u, unitExp("m/s"));
            assertEquals(unit("m/s"), u.toConcreteUnit());
            assertEquals(unit("m/s"), u3.toConcreteUnit());
        }));

        withMut(u => withMut(u3 => {
            // Test that an ambiguous resolution, followed by clarifier, gives right result:
            unify(u.times(u3.raisedTo(4)), times(unitExp("m^3/s"), unitExp("m/s^3")));
            unify(u, unitExp("m^4"));
            assertEquals(unit("m^4"), u.toConcreteUnit());
            assertEquals(unit("s^-1"), u3.toConcreteUnit());
        }));

        withMut(u => withMut(u3 => {
            // Test that an ambiguous resolution, followed by clarifier, gives right result:
            unify(u.times(u3), times(unitExp("m^3/s"), unitExp("m/s^3")));
            unify(u, unitExp("m/s"));
            assertEquals(unit("m/s"), u.toConcreteUnit());
            assertEquals(unit("m^3/s^3"), u3.toConcreteUnit());
        }));

        failure(() => unify(unitExp("m"), unitExp("s")));
    });

    // PORT-NOTE: as in Java, the AssertionError from fail() is itself caught, so this never fails.
    function failure(item: () => void): void
    {
        try
        {
            item();
            fail("Expected failure but succeeded");
        }
        catch (e)
        {
            if (e instanceof AssertionFailedError || e instanceof InternalException || e instanceof UserException)
                return;
            throw e;
        }
    }

    function withMut(withUnit: (u: UnitExp) => void): void
    {
        withUnit(new UnitExp(new MutUnitVar()));
    }

    function times(...units: UnitExp[]): UnitExp
    {
        let u = units[0]!;
        for (let i = 1; i < units.length; i++)
        {
            u = u.times(units[i]!);
        }
        return u;
    }

    function unify(...units: UnitExp[]): void
    {
        for (let i = 1; i < units.length; i++)
        {
            assertNotNull("Unifying " + units[0]!.toString() + " with " + units[i]!.toString(), units[0]!.unifyWith(units[i]!));
        }
    }
});
