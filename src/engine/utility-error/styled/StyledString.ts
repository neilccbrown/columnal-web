// Port of xyz.columnal.styled.StyledString (utility-error module).
import { javaEquals, javaHashCode, javaStringHashCode } from "../../java/JavaObject.js";
import type { Localized } from "../../anns/Annotations.js";

/**
 * What a Style applies to a piece of text when it is displayed.
 * PORT-NOTE: replaces the JavaFX Text node that Style.style(Text) modified; the GUI renders
 * each segment's classes and inline styles.
 */
export interface StyleTarget
{
    readonly classes: Set<string>;
    readonly inlineStyles: Map<string, string>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Class<T> = abstract new (...args: any[]) => T;

// I got VerifyError items (14th March 2018) when using Guava's ImmutableClassToInstanceMap, so this is
// my own simple equivalent, specialised to Style.  To be honest, it's a lot simpler by being specialised anyway:
// Only one style per class type in the styleMembers list:
class ImmutableStyleMap
{
    public static readonly EMPTY = new ImmutableStyleMap([]);

    constructor(public readonly styleMembers: readonly StyledString.AnyStyle[])
    {
    }

    public equals(other: unknown): boolean
    {
        return other instanceof ImmutableStyleMap && javaEquals(this.styleMembers, other.styleMembers);
    }

    public hashCode(): number
    {
        return javaHashCode(this.styleMembers);
    }
}

// We don't use Pair because we don't want the dependency:
class StyledSegment
{
    constructor(public readonly styleMap: ImmutableStyleMap, public readonly text: string)
    {
    }

    public mapFirst(f: (m: ImmutableStyleMap) => ImmutableStyleMap): StyledSegment
    {
        return new StyledSegment(f(this.styleMap), this.text);
    }

    public mapSecond(f: (s: string) => string): StyledSegment
    {
        return new StyledSegment(this.styleMap, f(this.text));
    }

    public equals(other: unknown): boolean
    {
        return other instanceof StyledSegment && this.styleMap.equals(other.styleMap) && this.text === other.text;
    }

    public hashCode(): number
    {
        return (Math.imul(31, this.styleMap.hashCode()) + javaStringHashCode(this.text)) | 0;
    }
}

/** A string made of segments, each with a set of styles (Java: a record of its members). */
export class StyledString
{
    private constructor(private readonly members: readonly StyledSegment[])
    {
    }

    public static builder(): StyledString.Builder
    {
        return new StyledString.Builder();
    }

    public static styled<S extends StyledString.Style<S>>(content: string, style: S): StyledString
    {
        return new StyledString([new StyledSegment(new ImmutableStyleMap([style]), content)]);
    }

    /**
     * Adds the given style to all our members.  If a style of the same class exists already,
     * they will get merged using the style's combine method.
     */
    public withStyle<S extends StyledString.Style<S>>(newStyle: S): StyledString
    {
        return new StyledString(this.members.map(p => p.mapFirst(prevStyles =>
        {
            const newStyles: StyledString.AnyStyle[] = [];
            let added = false;
            for (const prevStyleMember of prevStyles.styleMembers)
            {
                const prevStyleAsS = prevStyleMember.as(newStyle.thisClass);
                if (prevStyleAsS !== null)
                {
                    newStyles.push(prevStyleAsS.combine(newStyle));
                    added = true;
                }
                else
                {
                    newStyles.push(prevStyleMember);
                }
            }
            if (!added)
            {
                newStyles.push(newStyle);
            }
            return new ImmutableStyleMap(newStyles);
        })));
    }

    public toPlain(): Localized
    {
        return this.members.map(m => m.text).join("");
    }

    public toString(): string
    {
        return this.toPlain();
    }

    // Truncates the string if it is longer than the given length
    public limit(length: number): StyledString
    {
        if (this.getLength() > length)
        {
            return StyledString.concat(this.substring(0, length - 1), StyledString.s("…"));
        }
        else
            return this;
    }

    /**
     * Concats the items together, inserting divider between each pair
     */
    public static intercalate(divider: StyledString, items: readonly StyledString[]): StyledString
    {
        const l: StyledSegment[] = [];
        let addDivider = false;
        for (const item of items)
        {
            if (addDivider)
                l.push(...divider.members);
            l.push(...item.members);
            addDivider = true;
        }
        return new StyledString(l);
    }

    /**
     * Java: a Collector, used as stream.collect(StyledString.joining(s)).
     * PORT-NOTE: here it takes the items directly.
     */
    public static joining(items: readonly StyledString[], s: string): StyledString
    {
        const b = new StyledString.Builder();
        for (const x of items)
            b.append(x);
        return s === "" ? b.build() : b.build(StyledString.s(s));
    }

    public static concat(...items: StyledString[]): StyledString
    {
        return new StyledString(items.flatMap(ss => ss.members).filter(ss => ss.text !== ""));
    }

    public static s(content: string): StyledString
    {
        return new StyledString([new StyledSegment(ImmutableStyleMap.EMPTY, content)]);
    }

    public static roundBracket(inner: StyledString): StyledString
    {
        return StyledString.concat(StyledString.s("("), inner, StyledString.s(")"));
    }

    public static squareBracket(inner: StyledString): StyledString
    {
        return StyledString.concat(StyledString.s("["), inner, StyledString.s("]"));
    }

    public static fancyQuote(inner: StyledString): StyledString
    {
        return StyledString.concat(StyledString.s("“"), inner, StyledString.s("”"));
    }

    public getLength(): number
    {
        return this.members.reduce((total, p) => total + p.text.length, 0);
    }

    public substring(startIndexIncl: number, endIndexExcl: number): StyledString
    {
        const r: StyledSegment[] = [];
        let curPos = 0;
        let curIndex = 0;
        while (curIndex < this.members.length && curPos < startIndexIncl)
        {
            curPos += this.members[curIndex]!.text.length;

            if (curPos > startIndexIncl)
            {
                // Add on the relevant part of the last segment:
                const curPosFinal = curPos;
                r.push(this.members[curIndex]!.mapSecond(s => s.substring(s.length - (curPosFinal - startIndexIncl))));
            }
            curIndex += 1;
        }
        // Now in the middle of the segment:
        while (curIndex < this.members.length && curPos < endIndexExcl)
        {
            const maxLen = endIndexExcl - curPos;
            r.push(this.members[curIndex]!.mapSecond(s => s.substring(0, Math.min(maxLen, s.length))));
            curPos += this.members[curIndex]!.text.length;
            curIndex += 1;
        }

        return new StyledString(r);
    }

    /** Calls the function with each segment's styles and text, in order (the GUI uses this to render). */
    public forEach(doForEach: (styles: readonly StyledString.AnyStyle[], text: string) => void): void
    {
        for (const member of this.members)
        {
            doForEach(member.styleMap.styleMembers, member.text);
        }
    }

    public equals(other: unknown): boolean
    {
        return other instanceof StyledString && javaEquals(this.members, other.members);
    }

    public hashCode(): number
    {
        return javaHashCode(this.members);
    }
}

export namespace StyledString
{
    // Java's wildcard Style<?>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export type AnyStyle = Style<any>;

    // There will only be one style of a given class in any list of styles.
    export abstract class Style<S extends Style<S>>
    {
        protected constructor(public readonly thisClass: Class<S>)
        {
        }

        /** Java: style(Text).  PORT-NOTE: records CSS classes / inline styles instead of modifying a JavaFX node. */
        public abstract applyTo(target: StyleTarget): void;

        // The first applied style is this; the next applied style is the parameter.
        // To keep first, return this, to keep last, return the parameter.
        public abstract combine(withStyle: S): S;

        public as<T>(otherClass: Class<T>): T | null
        {
            if (this instanceof otherClass)
                return this as unknown as T;
            else
                return null;
        }

        public equals(x: unknown): boolean
        {
            if (x instanceof this.thisClass)
                return this.equalsStyle(x);
            else
                return false; // Styles of another class cannot equal this one
        }

        protected abstract equalsStyle(item: S): boolean;

        // We don't generally use styles in hash collections, and overriding in subclasses is a pain
        // when we only really want one implementation (equalsStyle), so we just return a hash of the class here
        // which obeys the contract for equals and hashCode just fine (they can only be equal if they have the same class).
        public hashCode(): number
        {
            return javaStringHashCode(this.thisClass.name);
        }
    }

    export class Builder
    {
        private readonly contents: StyledString[] = [];

        public append(item: StyledString | string): Builder
        {
            this.contents.push(typeof item === "string" ? StyledString.s(item) : item);
            return this;
        }

        public build(divider?: StyledString): StyledString
        {
            return divider === undefined ? StyledString.concat(...this.contents) : StyledString.intercalate(divider, this.contents);
        }
    }
}
