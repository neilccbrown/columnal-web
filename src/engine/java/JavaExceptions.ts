// Equivalents of java.lang runtime exceptions that ported code throws or catches.
// (NumberFormatException is in JavaString.ts and ArithmeticException in JavaBigDecimal.ts.)

/** java.lang.IndexOutOfBoundsException */
export class IndexOutOfBoundsException extends RangeError
{
    constructor(message: string)
    {
        super(message);
        this.name = "IndexOutOfBoundsException";
    }
}

/** java.lang.IllegalArgumentException */
export class IllegalArgumentException extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = "IllegalArgumentException";
    }
}

/** java.lang.IllegalStateException */
export class IllegalStateException extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = "IllegalStateException";
    }
}
