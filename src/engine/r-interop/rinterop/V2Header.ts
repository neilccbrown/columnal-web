// Port of xyz.columnal.rinterop.V2Header (r-interop module; package-private in Java).
import type { DataInputStream } from "../../java/DataStreams.js";

export class V2Header
{
    private readonly header: Uint8Array;
    public readonly formatVersion: number;
    private readonly writerVersion: number;
    private readonly readerVersion: number;

    public constructor(d: DataInputStream)
    {
        this.header = new Uint8Array(2);
        d.readFully(this.header);
        this.formatVersion = d.readInt();
        this.writerVersion = d.readInt();
        this.readerVersion = d.readInt();
    }
}
