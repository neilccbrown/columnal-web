// Port of xyz.columnal.rinterop.TypeHeader (r-interop module; package-private in Java).
import type { DataInputStream } from "../../java/DataStreams.js";
import { RRead } from "./RRead.js";
import type { RValue } from "./RValue.js";

/**
 * This is really just a single int read from R, but it has all the helper methods for interrogating the different parts.
 */
export class TypeHeader
{
    private readonly headerBits: number;

    public constructor(d: DataInputStream, _atoms: Map<number, string>)
    {
        this.headerBits = d.readInt();
    }

    public readAttributes(d: DataInputStream, atoms: Map<number, string>): RValue | null
    {
        let attr: RValue | null;
        if (this.hasAttributes())
        {
            // Also read trailing attributes:
            attr = RRead.readItem(d, atoms);
        }
        else
        {
            attr = null;
        }
        return attr;
    }

    public readTag(d: DataInputStream, atoms: Map<number, string>): RValue | null
    {
        let tag: RValue | null;
        if (this.hasTag())
        {
            // Also read trailing attributes:
            tag = RRead.readItem(d, atoms);
        }
        else
        {
            tag = null;
        }
        return tag;
    }

    public getType(): number
    {
        return this.headerBits & 0xFF;
    }

    public hasAttributes(): boolean
    {
        return (this.headerBits & 0x200) !== 0;
    }

    public hasTag(): boolean
    {
        return (this.headerBits & 0x400) !== 0;
    }

    public isObject(): boolean
    {
        return (this.headerBits & 0x100) !== 0;
    }

    public getReference(d: DataInputStream): number
    {
        const ref = this.headerBits >>> 8;
        if (ref === 0)
            return d.readInt();
        else
            return ref;
    }
}
