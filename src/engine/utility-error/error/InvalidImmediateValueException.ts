// Port of xyz.columnal.error.InvalidImmediateValueException (utility-error module).
import type { StyledString } from "../styled/StyledString.js";
import { UserException } from "./UserException.js";

export class InvalidImmediateValueException extends UserException
{
    private readonly invalid: string;

    constructor(message: StyledString, invalid: string)
    {
        super(message);
        this.invalid = invalid;
    }

    public getInvalid(): string
    {
        return this.invalid;
    }
}
