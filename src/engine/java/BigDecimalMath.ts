// Port of the parts of ch.obermuhlner.math.big.BigDecimalMath (big-math 2.3.0,
// https://github.com/eobermuhlner/big-math) that Columnal uses: log, log2 and log10.
//
// big-math's licence:
//   MIT License
//
//   Copyright (c) 2017 Eric Obermühlner
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// These functions are not correctly rounded, so the algorithm is ported exactly, including the
// exp and series code it uses internally, to give the same digits as Java (checked against the
// JVM by test/engine/functions/FunctionsGolden.test.ts).
//
// A MathContext is a precision and a rounding mode.  Java's BigDecimal operations that take a
// MathContext give the exact result rounded to it, as decimal.js's do with that precision, so
// each precision gets its own Decimal constructor (contexts are cached).  Operations without a
// MathContext are exact in Java, so they use a constructor with the maximum precision.
//
// PORT-NOTE: big-math caches log(2), log(3) and log(10) at the highest precision computed so
// far, which can affect the last digits of later results, so the caches are module state here
// too.  It compares a cached value's precision(), which in Java counts trailing zeros; decimal.js
// numbers have none, which could only matter for a request within a digit of the cached precision.
// The first guess in logUsingNewton uses Math.log, which may differ from Java's in the last bit;
// the Newton iterations then correct it far beyond the digits that are returned.
import { ArithmeticException, decimalFromBigInt, decimalFromDouble, Decimal, ONE, toJavaString, ZERO, type Rounding } from "./JavaBigDecimal.js";

/** java.math.MathContext */
export class MathContext
{
    public constructor(public readonly precision: number, public readonly roundingMode: Rounding = Decimal.ROUND_HALF_UP)
    {
    }

    /** MathContext.DECIMAL128: 34 digits, round half even */
    public static readonly DECIMAL128 = new MathContext(34, Decimal.ROUND_HALF_EVEN);
}

const contexts = new Map<string, typeof Decimal>();

// The Decimal constructor whose arithmetic rounds to the MathContext
function ctx(mc: MathContext): typeof Decimal
{
    const key = mc.precision + "/" + mc.roundingMode;
    let d = contexts.get(key);
    if (d === undefined)
    {
        d = Decimal.clone({ precision: mc.precision, rounding: mc.roundingMode });
        contexts.set(key, d);
    }
    return d;
}

// For Java's exact operations (add, subtract and multiply without a MathContext)
const Exact = Decimal.clone({ precision: 1e9 });

function add(a: Decimal, b: Decimal, mc?: MathContext): Decimal
{
    return new (mc === undefined ? Exact : ctx(mc))(a).plus(b);
}

function subtract(a: Decimal, b: Decimal, mc?: MathContext): Decimal
{
    return new (mc === undefined ? Exact : ctx(mc))(a).minus(b);
}

function multiply(a: Decimal, b: Decimal, mc?: MathContext): Decimal
{
    return new (mc === undefined ? Exact : ctx(mc))(a).times(b);
}

function divide(a: Decimal, b: Decimal, mc: MathContext): Decimal
{
    if (b.isZero())
        throw new ArithmeticException(a.isZero() ? "Division undefined" : "Division by zero");
    return new (ctx(mc))(a).div(b);
}

// Returns a number of the standard Decimal class: every operation here goes through the helpers
// above, which pick the precision explicitly, but numbers returned to callers must not carry the
// precision of the context that made them.
function round(value: Decimal, mathContext: MathContext): Decimal
{
    return new Decimal(value.toSignificantDigits(mathContext.precision, mathContext.roundingMode));
}

// BigDecimal.ONE.movePointLeft(n)
function onePointLeft(n: number): Decimal
{
    return new Exact(10).pow(-n);
}

function valueOf(n: number): Decimal
{
    return new Decimal(n);
}

const TWO = valueOf(2);
const THREE = valueOf(3);
const TEN = valueOf(10);

const DOUBLE_MAX_VALUE = decimalFromDouble(Number.MAX_VALUE);

const EXPECTED_INITIAL_PRECISION = 15;

let log2Cache: Decimal | null = null;
let log3Cache: Decimal | null = null;
let log10Cache: Decimal | null = null;

// BigDecimal.precision(), but without trailing zeros (see the PORT-NOTE at the top)
function precision(d: Decimal): number
{
    return d.precision(true);
}

function isDoubleValue(value: Decimal): boolean
{
    if (value.comparedTo(DOUBLE_MAX_VALUE) > 0)
    {
        return false;
    }
    if (value.comparedTo(DOUBLE_MAX_VALUE.neg()) < 0)
    {
        return false;
    }

    return true;
}

// value = mantissa * 10^exponent, with one digit before the mantissa's decimal point
function mantissa(value: Decimal): Decimal
{
    const exp = exponent(value);
    if (exp === 0)
    {
        return value;
    }

    return multiply(value, onePointLeft(exp));
}

function exponent(value: Decimal): number
{
    // Java: value.precision() - value.scale() - 1, which doesn't depend on trailing zeros
    return value.e;
}

function integralPart(value: Decimal): Decimal
{
    return value.trunc();
}

function reciprocal(x: Decimal, mathContext: MathContext): Decimal
{
    return divide(ONE, x, mathContext);
}

function pow(x: Decimal, y: number, mathContext: MathContext): Decimal
{
    const mc = mathContext.precision === 0 ? mathContext : new MathContext(mathContext.precision + 10, mathContext.roundingMode);

    // TODO optimize y=0, y=1, y=10^k, y=-1, y=-10^k

    if (y < 0)
    {
        const value = reciprocal(pow(x, -y, mc), mc);
        return round(value, mathContext);
    }

    let result = ONE;
    while (y > 0)
    {
        if (y % 2 === 1)
        {
            // odd exponent -> multiply result with x
            result = multiply(result, x, mc);
            y -= 1;
        }

        if (y > 0)
        {
            // even exponent -> square x
            x = multiply(x, x, mc);
        }

        y = Math.floor(y / 2);
    }

    return round(result, mathContext);
}

/**
 * Calculates the natural logarithm of x.
 * @throws ArithmeticException if x <= 0
 */
export function log(x: Decimal, mathContext: MathContext): Decimal
{
    if (x.comparedTo(ZERO) <= 0)
    {
        throw new ArithmeticException("Illegal log(x) for x <= 0: x = " + toJavaString(x));
    }
    if (x.comparedTo(ONE) === 0)
    {
        return ZERO;
    }

    let result: Decimal;
    switch (x.comparedTo(TEN))
    {
        case 0:
            result = logTen(mathContext);
            break;
        case 1:
            result = logUsingExponent(x, mathContext);
            break;
        default:
            result = logUsingTwoThree(x, mathContext);
    }

    return round(result, mathContext);
}

/** Calculates the logarithm of x to the base 2. */
export function log2(x: Decimal, mathContext: MathContext): Decimal
{
    const mc = new MathContext(mathContext.precision + 4, mathContext.roundingMode);

    const result = divide(log(x, mc), logTwo(mc), mc);
    return round(result, mathContext);
}

/** Calculates the logarithm of x to the base 10. */
export function log10(x: Decimal, mathContext: MathContext): Decimal
{
    const mc = new MathContext(mathContext.precision + 2, mathContext.roundingMode);

    const result = divide(log(x, mc), logTen(mc), mc);
    return round(result, mathContext);
}

function logUsingNewton(x: Decimal, mathContext: MathContext): Decimal
{
    // https://en.wikipedia.org/wiki/Natural_logarithm in chapter 'High Precision'
    // y = y + 2 * (x-exp(y)) / (x+exp(y))

    const maxPrecision = mathContext.precision + 20;
    const acceptableError = onePointLeft(mathContext.precision + 1);

    let result: Decimal;
    let adaptivePrecision: number;
    const doubleX = x.toNumber();
    if (doubleX > 0.0 && isDoubleValue(x))
    {
        result = decimalFromDouble(Math.log(doubleX));
        adaptivePrecision = EXPECTED_INITIAL_PRECISION;
    }
    else
    {
        result = divide(x, TWO, mathContext);
        adaptivePrecision = 1;
    }

    let step: Decimal;

    do
    {
        adaptivePrecision *= 3;
        if (adaptivePrecision > maxPrecision)
        {
            adaptivePrecision = maxPrecision;
        }
        const mc = new MathContext(adaptivePrecision, mathContext.roundingMode);

        const expY = exp(result, mc);
        step = divide(multiply(TWO, subtract(x, expY)), add(x, expY), mc);
        result = add(result, step);
    }
    while (adaptivePrecision < maxPrecision || step.abs().comparedTo(acceptableError) > 0);

    return result;
}

function logUsingExponent(x: Decimal, mathContext: MathContext): Decimal
{
    const mcDouble = new MathContext(mathContext.precision << 1, mathContext.roundingMode);
    const mc = new MathContext(mathContext.precision + 4, mathContext.roundingMode);

    const exp = exponent(x);
    const mant = mantissa(x);

    let result = logUsingTwoThree(mant, mc);
    if (exp !== 0)
    {
        result = add(result, multiply(valueOf(exp), logTen(mcDouble), mc));
    }
    return result;
}

function logUsingTwoThree(x: Decimal, mathContext: MathContext): Decimal
{
    const mcDouble = new MathContext(mathContext.precision << 1, mathContext.roundingMode);
    const mc = new MathContext(mathContext.precision + 4, mathContext.roundingMode);

    let factorOfTwo = 0;
    let powerOfTwo = 1;
    let factorOfThree = 0;
    let powerOfThree = 1;

    let value = x.toNumber();
    if (value < 0.01)
    {
        // do nothing
    }
    else if (value < 0.1)
    { // never happens when called by logUsingExponent()
        while (value < 0.6)
        {
            value *= 2;
            factorOfTwo--;
            powerOfTwo <<= 1;
        }
    }
    else if (value < 0.115)
    { // (0.1 - 0.11111 - 0.115) -> (0.9 - 1.0 - 1.035)
        factorOfThree = -2;
        powerOfThree = 9;
    }
    else if (value < 0.14)
    { // (0.115 - 0.125 - 0.14) -> (0.92 - 1.0 - 1.12)
        factorOfTwo = -3;
        powerOfTwo = 8;
    }
    else if (value < 0.2)
    { // (0.14 - 0.16667 - 0.2) - (0.84 - 1.0 - 1.2)
        factorOfTwo = -1;
        powerOfTwo = 2;
        factorOfThree = -1;
        powerOfThree = 3;
    }
    else if (value < 0.3)
    { // (0.2 - 0.25 - 0.3) -> (0.8 - 1.0 - 1.2)
        factorOfTwo = -2;
        powerOfTwo = 4;
    }
    else if (value < 0.42)
    { // (0.3 - 0.33333 - 0.42) -> (0.9 - 1.0 - 1.26)
        factorOfThree = -1;
        powerOfThree = 3;
    }
    else if (value < 0.7)
    { // (0.42 - 0.5 - 0.7) -> (0.84 - 1.0 - 1.4)
        factorOfTwo = -1;
        powerOfTwo = 2;
    }
    else if (value < 1.4)
    { // (0.7 - 1.0 - 1.4) -> (0.7 - 1.0 - 1.4)
        // do nothing
    }
    else if (value < 2.5)
    { // (1.4 - 2.0 - 2.5) -> (0.7 - 1.0 - 1.25)
        factorOfTwo = 1;
        powerOfTwo = 2;
    }
    else if (value < 3.5)
    { // (2.5 - 3.0 - 3.5) -> (0.833333 - 1.0 - 1.166667)
        factorOfThree = 1;
        powerOfThree = 3;
    }
    else if (value < 5.0)
    { // (3.5 - 4.0 - 5.0) -> (0.875 - 1.0 - 1.25)
        factorOfTwo = 2;
        powerOfTwo = 4;
    }
    else if (value < 7.0)
    { // (5.0 - 6.0 - 7.0) -> (0.833333 - 1.0 - 1.166667)
        factorOfThree = 1;
        powerOfThree = 3;
        factorOfTwo = 1;
        powerOfTwo = 2;
    }
    else if (value < 8.5)
    { // (7.0 - 8.0 - 8.5) -> (0.875 - 1.0 - 1.0625)
        factorOfTwo = 3;
        powerOfTwo = 8;
    }
    else if (value < 10.0)
    { // (8.5 - 9.0 - 10.0) -> (0.94444 - 1.0 - 1.11111)
        factorOfThree = 2;
        powerOfThree = 9;
    }
    else
    {
        while (value > 1.4)
        { // never happens when called by logUsingExponent()
            value /= 2;
            factorOfTwo++;
            powerOfTwo <<= 1;
        }
    }

    let correctedX = x;
    let result = ZERO;

    if (factorOfTwo > 0)
    {
        correctedX = divide(correctedX, valueOf(powerOfTwo), mc);
        result = add(result, multiply(logTwo(mcDouble), valueOf(factorOfTwo), mc));
    }
    else if (factorOfTwo < 0)
    {
        correctedX = multiply(correctedX, valueOf(powerOfTwo), mc);
        result = subtract(result, multiply(logTwo(mcDouble), valueOf(-factorOfTwo), mc));
    }

    if (factorOfThree > 0)
    {
        correctedX = divide(correctedX, valueOf(powerOfThree), mc);
        result = add(result, multiply(logThree(mcDouble), valueOf(factorOfThree), mc));
    }
    else if (factorOfThree < 0)
    {
        correctedX = multiply(correctedX, valueOf(powerOfThree), mc);
        result = subtract(result, multiply(logThree(mcDouble), valueOf(-factorOfThree), mc));
    }

    // Java compares references here: true if neither was changed above
    if (x === correctedX && result === ZERO)
    {
        return logUsingNewton(x, mathContext);
    }

    result = add(result, logUsingNewton(correctedX, mc), mc);

    return result;
}

function logTen(mathContext: MathContext): Decimal
{
    if (log10Cache !== null && mathContext.precision <= precision(log10Cache))
    {
        return round(log10Cache, mathContext);
    }
    else
    {
        log10Cache = logUsingNewton(TEN, mathContext);
        return log10Cache;
    }
}

function logTwo(mathContext: MathContext): Decimal
{
    if (log2Cache !== null && mathContext.precision <= precision(log2Cache))
    {
        return round(log2Cache, mathContext);
    }
    else
    {
        log2Cache = logUsingNewton(TWO, mathContext);
        return log2Cache;
    }
}

function logThree(mathContext: MathContext): Decimal
{
    if (log3Cache !== null && mathContext.precision <= precision(log3Cache))
    {
        return round(log3Cache, mathContext);
    }
    else
    {
        log3Cache = logUsingNewton(THREE, mathContext);
        return log3Cache;
    }
}

/** For tests: forgets the cached logarithms, as if in a new JVM. */
export function _test_clearCaches(): void
{
    log2Cache = null;
    log3Cache = null;
    log10Cache = null;
}

/** Calculates the natural exponent of x (e^x). */
function exp(x: Decimal, mathContext: MathContext): Decimal
{
    if (x.isZero())
    {
        return ONE;
    }

    return expIntegralFractional(x, mathContext);
}

function expIntegralFractional(x: Decimal, mathContext: MathContext): Decimal
{
    const integral = integralPart(x);

    if (integral.isZero())
    {
        return expTaylor(x, mathContext);
    }

    const fractionalPart = subtract(x, integral);

    const mc = new MathContext(mathContext.precision + 10, mathContext.roundingMode);

    const z = add(ONE, divide(fractionalPart, integral, mc));
    const t = expTaylor(z, mc);

    // Java: integralPart.intValueExact()
    const result = pow(t, integral.toNumber(), mc);

    return round(result, mathContext);
}

function expTaylor(x: Decimal, mathContext: MathContext): Decimal
{
    const mc = new MathContext(mathContext.precision + 6, mathContext.roundingMode);

    x = divide(x, valueOf(256), mc);

    let result = expCalculate(x, mc);
    result = pow(result, 256, mc);
    return round(result, mathContext);
}

// ExpCalculator.INSTANCE.calculate (SeriesCalculator.calculate): the Taylor series of e^x, whose
// factors are 1/n!.  (The Java caches the factors as BigRationals.)
function expCalculate(x: Decimal, mathContext: MathContext): Decimal
{
    const acceptableError = onePointLeft(mathContext.precision + 1);

    let powerOfX = ONE;
    let factorial = 1n;

    let sum = ZERO;
    let step: Decimal;
    let i = 0;
    do
    {
        if (i > 0)
            factorial *= BigInt(i);
        const xToThePower = powerOfX;
        powerOfX = multiply(powerOfX, x, mathContext);
        step = divide(xToThePower, decimalFromBigInt(factorial), mathContext);
        i++;

        sum = add(sum, step);
    }
    while (step.abs().comparedTo(acceptableError) > 0);

    return round(sum, mathContext);
}
