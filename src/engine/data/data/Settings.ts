// Port of xyz.columnal.data.Settings (data module).
import type { JavaFile } from "../../java/JavaFile.js";
import { javaEquals, javaObjectsHash } from "../../java/JavaObject.js";

export class Settings
{
    // IMPORTANT: if you add a field, you must redefine equals and hash code!

    // Can be null, in which case use PATH  (effectively just "R", but appears blank in settings)
    public readonly pathToRExecutable: JavaFile | null;
    public readonly useColumnalRLibs: boolean;

    public constructor(pathToRExecutable: JavaFile | null, useColumnalRLibs: boolean)
    {
        this.pathToRExecutable = pathToRExecutable;
        this.useColumnalRLibs = useColumnalRLibs;
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof Settings)) return false;
        const settings = o;
        return this.useColumnalRLibs === settings.useColumnalRLibs &&
            javaEquals(this.pathToRExecutable, settings.pathToRExecutable);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.pathToRExecutable, this.useColumnalRLibs);
    }
}
