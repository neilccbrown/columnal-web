// Port of xyz.columnal.data.datatype.ProgressListener (types module).
// Java: a functional interface with progressUpdate(double), so here a function type.
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";

export type ProgressListener = (progress: number) => void;

export namespace ProgressListener
{
    export function split(prog: ProgressListener | null): Pair<ProgressListener | null, ProgressListener | null>
    {
        if (prog === null)
            return new Pair<ProgressListener | null, ProgressListener | null>(null, null);
        const progFinal = prog;
        return new Pair<ProgressListener | null, ProgressListener | null>(a => progFinal(a * 0.5), b => progFinal(b * 0.5 + 0.5));
    }
}
