// Port of test.utility.PropUtility (tests-basic).
import { describe } from "vitest";
import type { Decimal } from "../../../../src/engine/java/JavaBigDecimal.js";
import { toPlainString } from "../../../../src/engine/java/JavaBigDecimal.js";
import { Utility } from "../../../../src/engine/utility/utility/Utility.js";
import { assertThat, Matchers } from "../../../support/hamcrest.js";
import { propertyTest } from "../../../support/quickcheck.js";
import { GenNumber } from "../fixtures/gen/GenNumber.js";

/**
 * Created by neil on 14/05/2017.
 */
describe("PropUtility", () =>
{
    propertyTest("testNumberFracUtilities", [new GenNumber()], (n: Decimal) =>
    {
        /* Too hard to test
        assertEquals(Utility.toBigDecimal(n),
            Utility.toBigDecimal(Utility.addSubtractNumbers(
                Utility.getIntegerPart(n),
                Utility.multiplyNumbers(Utility.getFracPart(n, 35), Utility.rationalToPower(Rational.of(10), -35))
                , true)));
        */
        for (let minDP = 0; minDP < 15; minDP++)
        {
            for (let maxDP = Math.max(1, minDP); maxDP <= 20; maxDP++)
            {
                let fracPartAsString = Utility.getFracPartAsString(n, minDP, maxDP);
                assertThat(fracPartAsString.length, Matchers.greaterThanOrEqualTo(minDP));
                assertThat(fracPartAsString.length, Matchers.lessThanOrEqualTo(maxDP));
                if (fracPartAsString !== "")
                    fracPartAsString = "." + fracPartAsString;
                if (fracPartAsString.endsWith("…"))
                {
                    // Check that it's a prefix of full string:
                    assertThat(toPlainString(Utility.toBigDecimal(n)), Matchers.startsWith(toPlainString(Utility.getIntegerPart(n)) + fracPartAsString.substring(0, fracPartAsString.length - 1)));
                }
                else
                {
                    assertThat(Utility.toBigDecimal(n), Matchers.comparesEqualTo(Utility.toBigDecimal(Utility.parseNumber(toPlainString(Utility.getIntegerPart(n)) + fracPartAsString))));
                }
            }
        }
    }, { trials: 2000 });
});
