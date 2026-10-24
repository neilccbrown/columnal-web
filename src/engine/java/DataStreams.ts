// java.io.DataInputStream and DataOutputStream (big-endian binary data), over byte arrays
// rather than streams: the engine reads files that were read in advance, and gives back
// the bytes of files it writes (see JavaFile.ts).
import { EOFException } from "./JavaExceptions.js";

export class DataInputStream
{
    private readonly view: DataView;
    private pos = 0;
    private markPos = 0;

    public constructor(private readonly bytes: Uint8Array)
    {
        this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }

    private need(count: number): void
    {
        if (this.pos + count > this.bytes.length)
        {
            this.pos = this.bytes.length;
            throw new EOFException();
        }
    }

    /** The next byte (0 to 255), or -1 at the end. */
    public read(): number
    {
        if (this.pos >= this.bytes.length)
            return -1;
        return this.bytes[this.pos++]!;
    }

    public readFully(dest: Uint8Array): void
    {
        this.need(dest.length);
        dest.set(this.bytes.subarray(this.pos, this.pos + dest.length));
        this.pos += dest.length;
    }

    public readInt(): number
    {
        this.need(4);
        const v = this.view.getInt32(this.pos, false);
        this.pos += 4;
        return v;
    }

    public readDouble(): number
    {
        this.need(8);
        const v = this.view.getFloat64(this.pos, false);
        this.pos += 8;
        return v;
    }

    // (Java's readlimit argument is not needed: the whole input is in memory.)
    public mark(_readlimit: number): void
    {
        this.markPos = this.pos;
    }

    public reset(): void
    {
        this.pos = this.markPos;
    }
}

export class DataOutputStream
{
    private bytes = new Uint8Array(1024);
    private length = 0;

    private ensure(extra: number): void
    {
        if (this.length + extra > this.bytes.length)
        {
            const bigger = new Uint8Array(Math.max(this.bytes.length * 2, this.length + extra));
            bigger.set(this.bytes.subarray(0, this.length));
            this.bytes = bigger;
        }
    }

    public writeByte(b: number): void
    {
        this.ensure(1);
        this.bytes[this.length++] = b & 0xFF;
    }

    public writeInt(v: number): void
    {
        this.ensure(4);
        new DataView(this.bytes.buffer).setInt32(this.length, v | 0, false);
        this.length += 4;
    }

    public writeDouble(v: number): void
    {
        this.ensure(8);
        new DataView(this.bytes.buffer).setFloat64(this.length, v, false);
        this.length += 8;
    }

    public write(b: Uint8Array): void
    {
        this.ensure(b.length);
        this.bytes.set(b, this.length);
        this.length += b.length;
    }

    /** Java: writeBytes(String), which writes the low byte of each char. */
    public writeBytes(s: string): void
    {
        for (let i = 0; i < s.length; i++)
            this.writeByte(s.charCodeAt(i));
    }

    public toByteArray(): Uint8Array
    {
        return this.bytes.slice(0, this.length);
    }
}
