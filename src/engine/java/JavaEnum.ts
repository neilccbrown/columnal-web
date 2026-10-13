// Support for porting Java enums to TypeScript numeric enums (see docs/CONVENTIONS.md).

/**
 * The equivalent of Java's Enum.values() for a numeric TypeScript enum: the
 * members in declaration (ordinal) order.  Functions merged into the enum via a
 * namespace and the enum's reverse (number -> name) mappings are skipped.
 */
export function javaEnumValues<E extends number>(enumObject: Record<string, string | number | ((...args: never[]) => unknown)>): E[]
{
    return Object.values(enumObject).filter((v): v is E => typeof v === "number").sort((a, b) => a - b);
}

/** The equivalent of Java's Enum.name() for a numeric TypeScript enum. */
export function javaEnumName(enumObject: Record<number, string>, value: number): string
{
    const name = enumObject[value];
    if (name === undefined)
        throw new Error(`No enum constant with ordinal ${value}`);
    return name;
}
