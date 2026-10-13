// JUnit 4 style assertions and assumptions, so ported Java tests keep their shape:
//   assertEquals(expected, actual) / assertEquals(message, expected, actual) / ... (delta)
//
// Equality follows Java's Object.equals (the engine's javaEquals) rather than JavaScript's ===
// or Vitest's deep equality: objects with an equals method are compared with it, arrays (Java
// Lists) and Maps/Sets element by element, numbers with == (but NaN equals NaN), and plain
// objects by identity.  A number never equals a bigint, just as an Integer never equals a Long.
import fc from "fast-check";
import { javaEquals } from "../../src/engine/java/JavaObject.js";
import { inProperty } from "./quickcheck.js";

// Java equality is the engine's, so tests and the code under test agree on it:
export { javaEquals };

/** Roughly Java's String.valueOf(x), for failure messages. */
export function javaToString(x: unknown): string
{
    if (x === null || x === undefined)
        return "null";
    if (Array.isArray(x))
        return "[" + x.map(javaToString).join(", ") + "]";
    if (x instanceof Map)
        return "{" + [...x].map(([k, v]) => javaToString(k) + "=" + javaToString(v)).join(", ") + "}";
    if (x instanceof Set)
        return "[" + [...x].map(javaToString).join(", ") + "]";
    if (typeof x === "string")
        return x;
    if (typeof x === "object" && x.toString === Object.prototype.toString)
    {
        try
        {
            return JSON.stringify(x, (_k, v: unknown) => typeof v === "bigint" ? v.toString() : v);
        }
        catch
        {
            // Fall through, e.g. for cyclic objects
        }
    }
    return String(x);
}

/** The error thrown by failed assertions; carries expected/actual so the test runner can show a diff. */
export class AssertionFailedError extends Error
{
    public readonly showDiff: boolean;

    constructor(message: string, public readonly expected?: unknown, public readonly actual?: unknown, showDiff: boolean = false)
    {
        super(message);
        this.name = "AssertionFailedError";
        this.showDiff = showDiff;
    }
}

function prefix(message: string | undefined): string
{
    return message === undefined || message === "" ? "" : message + " ";
}

function typeName(x: unknown): string
{
    if (x === null || x === undefined)
        return "null";
    if (typeof x === "object")
        return (x as { constructor?: { name?: string } }).constructor?.name ?? "Object";
    return typeof x;
}

function failNotEquals(message: string | undefined, expected: unknown, actual: unknown): never
{
    let e = javaToString(expected);
    let a = javaToString(actual);
    if (e === a)
    {
        // Same string form but not equal: show the types, as JUnit does.
        e = `${typeName(expected)}<${e}>`;
        a = `${typeName(actual)}<${a}>`;
    }
    throw new AssertionFailedError(`${prefix(message)}expected:<${e}> but was:<${a}>`, expected, actual, true);
}

function assertEqualsDelta(message: string | undefined, expected: number, actual: number, delta: number): void
{
    if (Object.is(expected, actual) || Math.abs(expected - actual) <= delta)
        return;
    failNotEquals(message, expected, actual);
}

/** assertEquals(expected, actual), assertEquals(message, expected, actual), or with a delta for doubles. */
export function assertEquals(expected: unknown, actual: unknown): void;
export function assertEquals(message: string, expected: unknown, actual: unknown): void;
export function assertEquals(expected: number, actual: number, delta: number): void;
export function assertEquals(message: string, expected: number, actual: number, delta: number): void;
export function assertEquals(...args: unknown[]): void
{
    if (args.length === 4)
    {
        const [message, expected, actual, delta] = args as [string, number, number, number];
        assertEqualsDelta(message, expected, actual, delta);
    }
    else if (args.length === 3 && typeof args[0] === "number" && typeof args[1] === "number" && typeof args[2] === "number")
    {
        const [expected, actual, delta] = args as [number, number, number];
        assertEqualsDelta(undefined, expected, actual, delta);
    }
    else if (args.length === 3)
    {
        const [message, expected, actual] = args as [string, unknown, unknown];
        if (!javaEquals(expected, actual))
            failNotEquals(message, expected, actual);
    }
    else if (args.length === 2)
    {
        if (!javaEquals(args[0], args[1]))
            failNotEquals(undefined, args[0], args[1]);
    }
    else
        throw new Error(`assertEquals called with ${args.length} arguments`);
}

export function assertNotEquals(unexpected: unknown, actual: unknown): void;
export function assertNotEquals(message: string, unexpected: unknown, actual: unknown): void;
export function assertNotEquals(...args: unknown[]): void
{
    const [message, unexpected, actual] = args.length === 3 ? args as [string, unknown, unknown] : [undefined, args[0], args[1]];
    if (javaEquals(unexpected, actual))
        throw new AssertionFailedError(`${message === undefined ? "Values should be different." : message + "."} Actual: ${javaToString(actual)}`);
}

export function assertTrue(condition: boolean): void;
export function assertTrue(message: string, condition: boolean): void;
export function assertTrue(...args: [boolean] | [string, boolean]): void
{
    const [message, condition] = args.length === 2 ? args : [undefined, args[0]];
    if (!condition)
        throw new AssertionFailedError(message ?? "");
}

export function assertFalse(condition: boolean): void;
export function assertFalse(message: string, condition: boolean): void;
export function assertFalse(...args: [boolean] | [string, boolean]): void
{
    const [message, condition] = args.length === 2 ? args : [undefined, args[0]];
    if (condition)
        throw new AssertionFailedError(message ?? "");
}

export function assertNull(object: unknown): void;
export function assertNull(message: string, object: unknown): void;
export function assertNull(...args: unknown[]): void
{
    const [message, object] = args.length === 2 ? args as [string, unknown] : [undefined, args[0]];
    if (object !== null && object !== undefined)
        failNotEquals(message ?? "Expected null", null, object);
}

export function assertNotNull(object: unknown): void;
export function assertNotNull(message: string, object: unknown): void;
export function assertNotNull(...args: unknown[]): void
{
    const [message, object] = args.length === 2 ? args as [string, unknown] : [undefined, args[0]];
    if (object === null || object === undefined)
        throw new AssertionFailedError(message ?? "");
}

export function assertSame(expected: unknown, actual: unknown): void;
export function assertSame(message: string, expected: unknown, actual: unknown): void;
export function assertSame(...args: unknown[]): void
{
    const [message, expected, actual] = args.length === 3 ? args as [string, unknown, unknown] : [undefined, args[0], args[1]];
    if (expected !== actual)
        throw new AssertionFailedError(`${prefix(message)}expected same:<${javaToString(expected)}> was not:<${javaToString(actual)}>`, expected, actual);
}

export function assertNotSame(unexpected: unknown, actual: unknown): void;
export function assertNotSame(message: string, unexpected: unknown, actual: unknown): void;
export function assertNotSame(...args: unknown[]): void
{
    const [message, unexpected, actual] = args.length === 3 ? args as [string, unknown, unknown] : [undefined, args[0], args[1]];
    if (unexpected === actual)
        throw new AssertionFailedError(`${prefix(message)}expected not same`);
}

export function fail(message?: string): never
{
    throw new AssertionFailedError(message ?? "");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ErrorClass<E> = abstract new (...args: any[]) => E;

/** JUnit 4.13's assertThrows: runs the function, checks it throws the given type, and returns the error. */
export function assertThrows<E>(expectedType: ErrorClass<E>, runnable: () => unknown): E;
export function assertThrows<E>(message: string, expectedType: ErrorClass<E>, runnable: () => unknown): E;
export function assertThrows<E>(...args: [ErrorClass<E>, () => unknown] | [string, ErrorClass<E>, () => unknown]): E
{
    const [message, expectedType, runnable] = args.length === 3 ? args : [undefined, args[0], args[1]];
    try
    {
        runnable();
    }
    catch (e)
    {
        if (e instanceof expectedType)
            return e;
        const err = new AssertionFailedError(`${prefix(message)}unexpected exception type thrown; expected:<${expectedType.name}> but was:<${typeName(e)}>`);
        err.cause = e;
        throw err;
    }
    throw new AssertionFailedError(`${prefix(message)}expected ${expectedType.name} to be thrown, but nothing was thrown`);
}

/** Thrown by a failed assume* outside a property (inside one, the trial is discarded instead). */
export class AssumptionViolatedError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = "AssumptionViolatedError";
    }
}

function assume(condition: boolean, message: string): void
{
    if (condition)
        return;
    if (inProperty())
        fc.pre(false); // Discards this trial, as junit-quickcheck does
    throw new AssumptionViolatedError(message + " (outside a property test a failed assumption fails the test; use Vitest's context.skip() instead)");
}

/** JUnit's Assume.assumeTrue: inside a property test, discards the current trial if false. */
export function assumeTrue(condition: boolean): void;
export function assumeTrue(message: string, condition: boolean): void;
export function assumeTrue(...args: [boolean] | [string, boolean]): void
{
    const [message, condition] = args.length === 2 ? args : ["assumeTrue failed", args[0]];
    assume(condition, message);
}

/** JUnit's Assume.assumeFalse: inside a property test, discards the current trial if true. */
export function assumeFalse(condition: boolean): void;
export function assumeFalse(message: string, condition: boolean): void;
export function assumeFalse(...args: [boolean] | [string, boolean]): void
{
    const [message, condition] = args.length === 2 ? args : ["assumeFalse failed", args[0]];
    assume(!condition, message);
}

/** JUnit's Assume.assumeNoException: discards the trial if an exception occurred. */
export function assumeNoException(e: unknown): void
{
    assume(e === null || e === undefined, "assumeNoException failed: " + javaToString(e));
}
