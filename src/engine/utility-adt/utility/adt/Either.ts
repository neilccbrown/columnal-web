// Port of xyz.columnal.utility.adt.Either (utility-adt module).
// PORT-NOTE: Java has variants of each method (either/eitherInt/eitherEx/eitherEx2/eitherEx3,
// map/mapInt/mapEx, ...) that differ only in the checked exceptions they declare.  TypeScript
// has no checked exceptions, so the variants are kept for porting convenience but all behave
// the same.  Java's `switch (e) { case Left l -> ... }` becomes `e instanceof Either.Left`.
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { javaEquals, javaHashCode } from "../../../java/JavaObject.js";

/**
 * Immutable Either class.  Note that A and B are allowed to be Nullable.
 */
export abstract class Either<A, B>
{
    public static left<A, B>(a: A): Either<A, B>
    {
        return new Either.Left<A, B>(a);
    }

    public static right<A, B>(b: B): Either<A, B>
    {
        return new Either.Right<A, B>(b);
    }

    public static getRights<A, B>(eithers: readonly Either<A, B>[]): B[]
    {
        return eithers.flatMap(e => e.either<B[]>(_a => [], b => [b]));
    }

    public abstract either<R>(withLeft: (a: A) => R, withRight: (b: B) => R): R;

    public eitherInt<R>(withLeft: (a: A) => R, withRight: (b: B) => R): R
    {
        return this.either(withLeft, withRight);
    }

    public eitherEx<R>(withLeft: (a: A) => R, withRight: (b: B) => R): R
    {
        return this.either(withLeft, withRight);
    }

    public eitherEx2<R>(withLeft: (a: A) => R, withRight: (b: B) => R): R
    {
        return this.either(withLeft, withRight);
    }

    public eitherEx3<R>(withLeft: (a: A) => R, withRight: (b: B) => R): R
    {
        return this.either(withLeft, withRight);
    }

    public either_(withLeft: (a: A) => void, withRight: (b: B) => void): void
    {
        this.either<void>(withLeft, withRight);
    }

    public eitherInt_(withLeft: (a: A) => void, withRight: (b: B) => void): void
    {
        this.either<void>(withLeft, withRight);
    }

    public eitherEx_(withLeft: (a: A) => void, withRight: (b: B) => void): void
    {
        this.either<void>(withLeft, withRight);
    }

    // Bit like liftA2/liftM2 for Either monad, but it does examine both Eithers
    // and it concatenates the errors rather than just using the first one
    // Right is only returned if both inputs are right, otherwise Left will be returned.
    public static combineConcatError<E, A, B, C>(ea: Either<readonly E[], A>, eb: Either<readonly E[], B>, combine: (a: A, b: B) => C): Either<readonly E[], C>
    {
        return ea.either(errsA => Either.left<readonly E[], C>(eb.either<readonly E[]>(errsB => [...errsA, ...errsB], _bx => errsA)),
            ax => eb.either(errsB => Either.left<readonly E[], C>(errsB), bx => Either.right<readonly E[], C>(combine(ax, bx))));
    }

    // Maps the items to Either, but stops at the first Left and returns it.  If no Lefts, returns all the Rights as list.
    public static mapM<E, R, T>(xs: readonly T[], applyOne: (t: T) => Either<E, R>): Either<E, R[]>
    {
        const r: R[] = [];
        for (const x of xs)
        {
            const y = applyOne(x);
            if (y instanceof Either.Left)
                return Either.left(y.a);
            else if (y instanceof Either.Right)
                r.push(y.b);
        }
        return Either.right(r);
    }

    public static mapMInt<E, R, T>(xs: readonly T[], applyOne: (t: T) => Either<E, R>): Either<E, R[]>
    {
        return Either.mapM(xs, applyOne);
    }

    public static mapMEx<E, R, T>(xs: readonly T[], applyOne: (t: T) => Either<E, R>): Either<E, R[]>
    {
        return Either.mapM(xs, applyOne);
    }

    // Equivalent to either(Either::left, Either.right . applyRight)
    public map<R>(applyRight: (b: B) => R): Either<A, R>
    {
        return this.either(a => Either.left<A, R>(a), b => Either.right<A, R>(applyRight(b)));
    }

    public mapInt<R>(applyRight: (b: B) => R): Either<A, R>
    {
        return this.map(applyRight);
    }

    public mapEx<R>(applyRight: (b: B) => R): Either<A, R>
    {
        return this.map(applyRight);
    }

    // Equivalent to either(Either::left, applyRight)
    public flatMap<R>(bind: (b: B) => Either<A, R>): Either<A, R>
    {
        return this.either(a => Either.left<A, R>(a), bind);
    }

    public flatMapInt<R>(bind: (b: B) => Either<A, R>): Either<A, R>
    {
        return this.flatMap(bind);
    }

    public flatMapEx<R>(bind: (b: B) => Either<A, R>): Either<A, R>
    {
        return this.flatMap(bind);
    }

    //Use either/either_ instead if at all possible
    public getLeft(error: string): A
    {
        return this.either(a => a, _b => { throw new InternalException(error); });
    }

    //Use either/either_ instead if at all possible
    public getRight(error: string): B
    {
        return this.either(_a => { throw new InternalException(error); }, b => b);
    }

    //Use either/either_ instead if at all possible
    public abstract isLeft(): boolean;

    //Use either/either_ instead if at all possible
    public abstract isRight(): boolean;

    // Equivalent to either(l -> null, r -> r), but saves adding the annoying
    // type annotations.
    public leftToNull(): B | null
    {
        return this.either<B | null>(_l => null, r => r);
    }

    public ifLeft(withLeft: (a: A) => void): void
    {
        this.either_(withLeft, _b => {});
    }

    public ifRight(withRight: (b: B) => void): void
    {
        this.either_(_a => {}, withRight);
    }

    public mapBoth<C, D>(withLeft: (a: A) => C, withRight: (b: B) => D): Either<C, D>
    {
        return this.either(a => Either.left<C, D>(withLeft(a)), b => Either.right<C, D>(withRight(b)));
    }

    public mapBothInt<C, D>(withLeft: (a: A) => C, withRight: (b: B) => D): Either<C, D>
    {
        return this.mapBoth(withLeft, withRight);
    }

    public mapBothEx<C, D>(withLeft: (a: A) => C, withRight: (b: B) => D): Either<C, D>
    {
        return this.mapBoth(withLeft, withRight);
    }

    public mapBothEx2<C, D>(withLeft: (a: A) => C, withRight: (b: B) => D): Either<C, D>
    {
        return this.mapBoth(withLeft, withRight);
    }

    public mapBothEx3<C, D>(withLeft: (a: A) => C, withRight: (b: B) => D): Either<C, D>
    {
        return this.mapBoth(withLeft, withRight);
    }

    // If the value in the either is null, return null, else return a new either without the nullable qualifier
    public static surfaceNull<A, B>(e: Either<A | null, B | null>): Either<A, B> | null
    {
        return e.either<Either<A, B> | null>(l => l === null ? null : Either.left<A, B>(l), r => r === null ? null : Either.right<A, B>(r));
    }

    public abstract equals(o: unknown): boolean;
    public abstract hashCode(): number;
}

export namespace Either
{
    // Java: interfaces generic in the checked exceptions thrown
    export type FunctionEx2<T, R> = (t: T) => R;
    export type FunctionEx3<T, R> = (t: T) => R;

    export class Left<A, B> extends Either<A, B>
    {
        // Use Either.left
        public constructor(public readonly a: A)
        {
            super();
        }

        public override equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof Left)) return false;
            return javaEquals(this.a, o.a);
        }

        public override hashCode(): number
        {
            return javaHashCode(this.a);
        }

        public override either<R>(withLeft: (a: A) => R, _withRight: (b: B) => R): R
        {
            return withLeft(this.a);
        }

        public override isLeft(): boolean
        {
            return true;
        }

        public override isRight(): boolean
        {
            return false;
        }

        public override toString(): string
        {
            return "Left {" + String(this.a) + "}";
        }
    }

    export class Right<A, B> extends Either<A, B>
    {
        // Use Either.right
        public constructor(public readonly b: B)
        {
            super();
        }

        public override equals(o: unknown): boolean
        {
            if (this === o) return true;
            if (!(o instanceof Right)) return false;
            return javaEquals(this.b, o.b);
        }

        public override hashCode(): number
        {
            return javaHashCode(this.b);
        }

        public override either<R>(_withLeft: (a: A) => R, withRight: (b: B) => R): R
        {
            return withRight(this.b);
        }

        public override isLeft(): boolean
        {
            return false;
        }

        public override isRight(): boolean
        {
            return true;
        }

        public override toString(): string
        {
            return "Right {" + String(this.b) + "}";
        }
    }
}
