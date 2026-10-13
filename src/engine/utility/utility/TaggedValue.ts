// Port of xyz.columnal.utility.TaggedValue (utility module).
import { javaEquals, javaHashCode } from "../../java/JavaObject.js";
import type { Value } from "./Value.js";

/**
 * Created by neil on 10/01/2017.
 */
export class TaggedValue
{
    private readonly tagIndex: number;
    // The tagIndex is the canonical value, the tagName is for info only:
    private readonly tagName: string;
    private readonly innerItem: Value | null;

    public constructor(tagIndex: number, innerItem: Value | null, taggedTypeDefinition: TaggedValue.TaggedTypeDefinitionBase)
    {
        this.tagIndex = tagIndex;
        this.innerItem = innerItem;
        this.tagName = taggedTypeDefinition.getTagName(tagIndex);
    }

    public static immediate(tagIndex: number, innerItem: Value | null, taggedTypeDefinition: TaggedValue.TaggedTypeDefinitionBase): TaggedValue
    {
        return new TaggedValue(tagIndex, innerItem, taggedTypeDefinition);
    }

    public getTagIndex(): number
    {
        return this.tagIndex;
    }

    public getInner(): Value | null
    {
        return this.innerItem;
    }

    public getTagName(): string
    {
        return this.tagName;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof TaggedValue)) return false;
        if (this.tagIndex !== o.tagIndex) return false;
        return this.innerItem !== null ? javaEquals(this.innerItem, o.innerItem) : o.innerItem === null;
    }

    public hashCode(): number
    {
        let result = this.tagIndex;
        result = (Math.imul(31, result) + (this.innerItem !== null ? javaHashCode(this.innerItem) : 0)) | 0;
        return result;
    }

    public toString(): string
    {
        return "TaggedValue{" + this.tagIndex + ": " + String(this.innerItem) + "}";
    }
}

export namespace TaggedValue
{
    export interface TaggedTypeDefinitionBase
    {
        getTagName(tagIndex: number): string;
    }
}
