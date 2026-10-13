// The subset of Hamcrest used by Columnal's tests: assertThat/assumeThat and a few matchers.
//   Java:  assertThat(x, Matchers.greaterThanOrEqualTo(3));
//   TS:    assertThat(x, Matchers.greaterThanOrEqualTo(3));
import { AssertionFailedError, assumeTrue, javaEquals, javaToString } from "./junit.js";

export interface Matcher<T>
{
    matches(actual: T): boolean;
    /** Description of what is expected, e.g. "a value greater than <3>". */
    describe(): string;
}

/** Hamcrest's MatcherAssert.assertThat. */
export function assertThat<T>(actual: T, matcher: Matcher<T>): void;
export function assertThat<T>(reason: string, actual: T, matcher: Matcher<T>): void;
export function assertThat(reason: string, assertion: boolean): void;
export function assertThat(...args: unknown[]): void
{
    if (args.length === 2 && typeof args[1] === "boolean")
    {
        if (!args[1])
            throw new AssertionFailedError(args[0] as string);
        return;
    }
    const [reason, actual, matcher] = args.length === 3 ? args as [string, unknown, Matcher<unknown>] : ["", args[0], args[1] as Matcher<unknown>];
    if (!matcher.matches(actual))
        throw new AssertionFailedError(`${reason}\nExpected: ${matcher.describe()}\n     but: was <${javaToString(actual)}>`);
}

/** JUnit's Assume.assumeThat: inside a property test, discards the current trial if the matcher fails. */
export function assumeThat<T>(actual: T, matcher: Matcher<T>): void
{
    assumeTrue(`assumeThat failed: expected ${matcher.describe()} but was <${javaToString(actual)}>`, matcher.matches(actual));
}

interface Comparable
{
    compareTo(other: unknown): number;
}

// Java's Comparable.compareTo for the ported types (objects with compareTo) and for primitives.
function compare(a: unknown, b: unknown): number
{
    if (typeof a === "object" && a !== null && typeof (a as Partial<Comparable>).compareTo === "function")
        return (a as Comparable).compareTo(b);
    if ((typeof a === "number" || typeof a === "bigint" || typeof a === "string") && typeof a === typeof b)
        return a < (b as typeof a) ? -1 : a > (b as typeof a) ? 1 : 0;
    throw new TypeError(`Cannot compare ${javaToString(a)} with ${javaToString(b)}`);
}

function matcher<T>(describe: () => string, matches: (actual: T) => boolean): Matcher<T>
{
    return { matches, describe };
}

export const Matchers = {
    equalTo<T>(expected: T): Matcher<T>
    {
        return matcher(() => `<${javaToString(expected)}>`, actual => javaEquals(actual, expected));
    },
    is<T>(expectedOrMatcher: T | Matcher<T>): Matcher<T>
    {
        return isMatcher(expectedOrMatcher) ? expectedOrMatcher : Matchers.equalTo(expectedOrMatcher);
    },
    not<T>(expectedOrMatcher: T | Matcher<T>): Matcher<T>
    {
        const m = isMatcher(expectedOrMatcher) ? expectedOrMatcher : Matchers.equalTo(expectedOrMatcher);
        return matcher(() => `not ${m.describe()}`, actual => !m.matches(actual));
    },
    anyOf<T>(...matchers: Matcher<T>[]): Matcher<T>
    {
        return matcher(() => "(" + matchers.map(m => m.describe()).join(" or ") + ")", actual => matchers.some(m => m.matches(actual)));
    },
    allOf<T>(...matchers: Matcher<T>[]): Matcher<T>
    {
        return matcher(() => "(" + matchers.map(m => m.describe()).join(" and ") + ")", actual => matchers.every(m => m.matches(actual)));
    },
    nullValue(): Matcher<unknown>
    {
        return matcher(() => "null", actual => actual === null || actual === undefined);
    },
    notNullValue(): Matcher<unknown>
    {
        return matcher(() => "not null", actual => actual !== null && actual !== undefined);
    },
    comparesEqualTo<T>(expected: T): Matcher<T>
    {
        return matcher(() => `a value equal to <${javaToString(expected)}>`, actual => compare(actual, expected) === 0);
    },
    greaterThan<T>(expected: T): Matcher<T>
    {
        return matcher(() => `a value greater than <${javaToString(expected)}>`, actual => compare(actual, expected) > 0);
    },
    greaterThanOrEqualTo<T>(expected: T): Matcher<T>
    {
        return matcher(() => `a value equal to or greater than <${javaToString(expected)}>`, actual => compare(actual, expected) >= 0);
    },
    lessThan<T>(expected: T): Matcher<T>
    {
        return matcher(() => `a value less than <${javaToString(expected)}>`, actual => compare(actual, expected) < 0);
    },
    lessThanOrEqualTo<T>(expected: T): Matcher<T>
    {
        return matcher(() => `a value less than or equal to <${javaToString(expected)}>`, actual => compare(actual, expected) <= 0);
    },
    startsWith(prefix: string): Matcher<string>
    {
        return matcher(() => `a string starting with "${prefix}"`, actual => actual.startsWith(prefix));
    },
    endsWith(suffix: string): Matcher<string>
    {
        return matcher(() => `a string ending with "${suffix}"`, actual => actual.endsWith(suffix));
    },
    containsString(substring: string): Matcher<string>
    {
        return matcher(() => `a string containing "${substring}"`, actual => actual.includes(substring));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    instanceOf<T>(type: abstract new (...args: any[]) => T): Matcher<unknown>
    {
        return matcher(() => `an instance of ${type.name}`, actual => actual instanceof type);
    },
};

function isMatcher<T>(x: T | Matcher<T>): x is Matcher<T>
{
    return typeof x === "object" && x !== null && typeof (x as Partial<Matcher<T>>).matches === "function"
        && typeof (x as Partial<Matcher<T>>).describe === "function";
}
