// Port of xyz.columnal.utility.gui.ErrorableTextField (utility-gui module): only the parts that aren't
// JavaFX: the result of converting the field's text (a value, or an error with quick fixes), and the
// checks that make one.
//
// PORT-DEFERRED: the field itself (a TextField with an error popup), which is rebuilt as
// src/gui/components/ErrorableTextField.vue; Java's subclasses (e.g. for table names) use these
// with it.
import type { Localized } from "../../../../engine/anns/Annotations.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../../../engine/utility-error/error/UserException.js";
import { StyledCSS } from "../../../../engine/utility-error/styled/StyledCSS.js";
import { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";

export namespace ErrorableTextField
{
    export class ConversionResult<T>
    {
        private readonly value: T | null;
        private readonly error: StyledString | null;
        private readonly fixes: readonly QuickFix[];
        private readonly warnings: readonly Localized[];

        private constructor(value: T | null, error: StyledString | null, fixes: readonly QuickFix[], warnings: readonly Localized[])
        {
            this.value = value;
            this.error = error;
            this.fixes = fixes;
            this.warnings = warnings;
        }

        public getValue(): T | null
        {
            return this.value;
        }

        public getError(): StyledString | null
        {
            return this.error;
        }

        public getWarnings(): readonly Localized[]
        {
            return this.warnings;
        }

        public static success<T>(value: T, ...warnings: Localized[]): ConversionResult<T>
        {
            return new ConversionResult<T>(value, null, [], warnings);
        }

        public static error<T>(error: StyledString, ...fixes: QuickFix[]): ConversionResult<T>
        {
            return new ConversionResult<T>(null, error, fixes, []);
        }

        public getFixes(): readonly QuickFix[]
        {
            return this.fixes;
        }
    }

    export class QuickFix
    {
        public readonly fixDescription: StyledString;
        public readonly fixedValue: string;

        public constructor(fixDescription: StyledString, fixedValue: string)
        {
            this.fixDescription = fixDescription;
            this.fixedValue = fixedValue;
        }
    }

    export function validate<T>(getValue: () => T): ConversionResult<T>
    {
        try
        {
            return ConversionResult.success(getValue());
        }
        catch (e)
        {
            if (e instanceof InternalException)
                return ConversionResult.error(StyledString.concat(StyledString.s("Internal Error: "), e.getStyledMessage()));
            if (e instanceof UserException)
                return ConversionResult.error(e.getStyledMessage());
            throw e;
        }
    }

    /**
     * Checks that each code point is valid (given whether it is the first); the first that isn't is an
     * error, with a fix that removes it (unless it is only invalid at the start).
     */
    export function checkAlphabet<T>(src: string, validCodepoint: (codepoint: number, first: boolean) => boolean, makeResult: (s: string) => T): ConversionResult<T>
    {
        const codePoints = [...src].map(c => c.codePointAt(0)!);
        for (let i = 0; i < codePoints.length; i++)
        {
            const codepoint = codePoints[i]!;
            if (!validCodepoint(codepoint, i === 0))
            {
                const code = StyledString.s("Character code: \\u" + codepoint.toString(16)).withStyle(new StyledCSS("errorable-sub-explanation"));
                if (i === 0 && validCodepoint(codepoint, false))
                {
                    return ConversionResult.error(StyledString.concat(TranslationUtility.getStyledString("error.illegalCharacter.start", Utility.codePointToString(codepoint)), StyledString.s("\n  "), code));
                }
                return ConversionResult.error(
                    StyledString.concat(TranslationUtility.getStyledString("error.illegalCharacter", Utility.codePointToString(codepoint)), StyledString.s("\n  "), code),
                    new QuickFix(StyledString.s(TranslationUtility.getString("error.illegalCharacter.remove")), String.fromCodePoint(...codePoints.slice(0, i), ...codePoints.slice(i + 1))),
                );
            }
        }
        return ConversionResult.success(makeResult(src));
    }
}
