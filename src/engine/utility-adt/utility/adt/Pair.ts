// Port of xyz.columnal.utility.adt.Pair (utility-adt module).
import { comparing, javaEquals, javaHashCode, type Comparator } from "../../../java/JavaObject.js";

/**
 * Created by neil on 02/11/2016.
 *
 * Java: a record Pair(A first, B second), with record equals/hashCode.
 */
export class Pair<A, B>
{
    public constructor(public readonly first: A, public readonly second: B)
    {
    }

    public getFirst(): A
    {
        return this.first;
    }

    public getSecond(): B
    {
        return this.second;
    }

    public map<C, D>(mapFirst: (a: A) => C, mapSecond: (b: B) => D): Pair<C, D>
    {
        return new Pair(mapFirst(this.first), mapSecond(this.second));
    }

    public mapFirst<C>(map: (a: A) => C): Pair<C, B>
    {
        return new Pair(map(this.first), this.second);
    }

    public mapSecond<C>(map: (b: B) => C): Pair<A, C>
    {
        return new Pair(this.first, map(this.second));
    }

    public replaceFirst<C>(replacement: C): Pair<C, B>
    {
        return new Pair<C, B>(replacement, this.second);
    }

    public replaceSecond<C>(replacement: C): Pair<A, C>
    {
        return new Pair<A, C>(this.first, replacement);
    }

    public toString(): string
    {
        return "(" + String(this.first) + ", " + String(this.second) + ")";
    }

    public equals(o: unknown): boolean
    {
        return o instanceof Pair && javaEquals(this.first, o.first) && javaEquals(this.second, o.second);
    }

    public hashCode(): number
    {
        return (Math.imul(31, javaHashCode(this.first)) + javaHashCode(this.second)) | 0;
    }

    public static comparator<A, B>(): Comparator<Pair<A, B>>
    {
        return comparing<Pair<A, B>>(p => p.getFirst(), p => p.getSecond());
    }

    public static comparatorFirst<A, B>(): Comparator<Pair<A, B>>
    {
        return comparing<Pair<A, B>>(p => p.getFirst());
    }
}
