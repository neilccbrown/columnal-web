// Port of xyz.columnal.rinterop.RExecution (r-interop module).
//
// PORT-DEFERRED: running R.  Java runs the R executable as a separate process, passing it the
// tables (via RWrite) and reading back the result (via RRead).  The browser cannot run
// processes, so R will run in webR (R compiled to WebAssembly) in Phase 12.  Until then,
// every R expression fails with a UserException, as it does in Java when R is not installed.
import type { RecordSet } from "../../data/data/RecordSet.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { RValue } from "./RValue.js";

export class RExecution
{
    // Java: runRExpression(String) and runRExpression(String, ImmutableList<String> packages, ImmutableMap<String, RecordSet> tablesToPass)
    public static runRExpression(_rExpression: string, _packages: readonly string[] = [], _tablesToPass: ReadonlyMap<string, RecordSet> = new Map()): RValue
    {
        throw new UserException("R is not available in this version of Columnal");
    }
}
