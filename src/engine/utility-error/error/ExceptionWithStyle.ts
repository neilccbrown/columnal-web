// Port of xyz.columnal.error.ExceptionWithStyle (utility-error module).
import { StyledString } from "../styled/StyledString.js";
import type { Localized } from "../../anns/Annotations.js";

export class ExceptionWithStyle extends Error
{
    private readonly styledMessage: StyledString;

    // Java has a protected (StyledString) and a public (StyledString, Throwable) constructor.
    constructor(styledMessage: StyledString, cause?: unknown)
    {
        super(styledMessage.toPlain(), cause === undefined ? undefined : { cause });
        this.name = new.target.name;
        this.styledMessage = styledMessage;
    }

    public getStyledMessage(): StyledString
    {
        return this.styledMessage;
    }

    /** Java's Throwable.getLocalizedMessage(). */
    public getLocalizedMessage(): Localized
    {
        return this.message;
    }

    /** Java's Throwable.getMessage(). */
    public getMessage(): string
    {
        return this.message;
    }

    /** Java's Throwable.getCause(). */
    public getCause(): unknown
    {
        return this.cause ?? null;
    }
}
