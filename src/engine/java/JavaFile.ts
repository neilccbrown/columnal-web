// Stand-in for java.io.File (and the parts of java.nio.file.Path that Columnal uses).
//
// PORT-NOTE: the engine runs in the browser, where reading a file is asynchronous, while the
// Java engine reads files synchronously.  So a JavaFile carries the file's contents, read in
// advance (by the GUI, from a file the user picked), and the engine reads them synchronously.
// Paths are POSIX-style; a relative path is taken relative to the root, "/".
import { IOException } from "./JavaExceptions.js";
import { javaStringHashCode } from "./JavaObject.js";

export class JavaFile
{
    private readonly path: string;
    private readonly contents: Uint8Array | null;

    /**
     * @param path The path of the file, as given to Java's File constructor.
     * @param contents The bytes of the file, or null if not available (reading then throws IOException).
     */
    public constructor(path: string, contents: Uint8Array | null = null)
    {
        this.path = path;
        this.contents = contents;
    }

    public getPath(): string
    {
        return this.path;
    }

    public getAbsolutePath(): string
    {
        return this.path.startsWith("/") ? this.path : "/" + this.path;
    }

    public getName(): string
    {
        return this.path.substring(this.path.lastIndexOf("/") + 1);
    }

    /** Java: Files.readAllBytes(file.toPath()) */
    public readAllBytes(): Uint8Array
    {
        if (this.contents === null)
            throw new IOException(this.getAbsolutePath() + ": contents not available");
        return this.contents;
    }

    // Java's File.equals and hashCode compare the path (on Unix, case-sensitively).
    public equals(o: unknown): boolean
    {
        return o instanceof JavaFile && o.path === this.path;
    }

    public hashCode(): number
    {
        return (javaStringHashCode(this.path) ^ 1234321) | 0;
    }

    public toString(): string
    {
        return this.path;
    }
}
