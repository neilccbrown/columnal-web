// Port of xyz.columnal.utility.adt.ComparableEither (utility-adt module).
// Java: a sealed interface extending Either and Comparable, implemented by Left and Right
// subclasses of Either.Left/Right.  Here it is the union of those two classes.
import { javaCompare, type Comparable } from "../../../java/JavaObject.js";
import { Either } from "./Either.js";

export type ComparableEither<A, B> = ComparableEither.Left<A, B> | ComparableEither.Right<A, B>;

export namespace ComparableEither
{
    export function left<A, B>(a: A): ComparableEither<A, B>
    {
        return new Left<A, B>(a);
    }

    export function right<A, B>(b: B): ComparableEither<A, B>
    {
        return new Right<A, B>(b);
    }

    export function fromEither<A, B>(original: Either<A, B>): ComparableEither<A, B>
    {
        return original.either<ComparableEither<A, B>>(x => left<A, B>(x), x => right<A, B>(x));
    }

    function compare<A, B>(us: ComparableEither<A, B>, o: ComparableEither<A, B>): number
    {
        return us.either(l => o.either(l2 => javaCompare(l, l2), _r2 => -1), r => o.either(_l2 => 1, r2 => javaCompare(r, r2)));
    }

    export class Left<A, B> extends Either.Left<A, B> implements Comparable<ComparableEither<A, B>>
    {
        public compareTo(o: ComparableEither<A, B>): number
        {
            return compare<A, B>(this, o);
        }
    }

    export class Right<A, B> extends Either.Right<A, B> implements Comparable<ComparableEither<A, B>>
    {
        public compareTo(o: ComparableEither<A, B>): number
        {
            return compare<A, B>(this, o);
        }
    }
}
