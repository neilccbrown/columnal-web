// Port of xyz.columnal.error.UserException (utility-error module).
import { StyledString } from "../styled/StyledString.js";
import { ExceptionWithStyle } from "./ExceptionWithStyle.js";

/**
 * Created by neil on 22/10/2016.
 */
export class UserException extends ExceptionWithStyle
{
    // Java: UserException(String), UserException(String, Throwable), UserException(StyledString)
    constructor(message: string | StyledString, cause?: unknown)
    {
        super(typeof message === "string" ? StyledString.s(message) : message, cause);
    }
}
