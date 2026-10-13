// Port of xyz.columnal.error.FetchException (utility-error module).
import { UserException } from "./UserException.js";

/**
 * Exception thrown when there is an issue reading external data.
 */
export class FetchException extends UserException
{
    // Java: the cause is an IOException or NumberFormatException
    constructor(message: string, cause: unknown)
    {
        super(message, cause);
    }
}
