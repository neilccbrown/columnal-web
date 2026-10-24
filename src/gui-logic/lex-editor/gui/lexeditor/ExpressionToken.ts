// Port of xyz.columnal.gui.lexeditor.ExpressionToken (lex-editor module).
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";

/**
 * An interface for keywords and operators, to get their content and their styled representation.
 *
 * Java's default toStyledString is ExpressionToken.defaultStyledString here.
 */
export interface ExpressionToken extends StyledShowable
{
    // Gets the actual content for the expression
    getContent(): string;

    toStyledString(): StyledString;
}

export namespace ExpressionToken
{
    /** Java: the default method toStyledString */
    export function defaultStyledString(token: ExpressionToken): StyledString
    {
        return StyledString.s(token.getContent());
    }
}
