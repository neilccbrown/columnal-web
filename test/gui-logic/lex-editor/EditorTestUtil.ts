// Helpers for the tests of the editors' lexers, derived from the GUI tests of the editors
// (BaseTestExpressionEditorError, TestTypeEditorError, ...), which type some text into an
// editor and check the errors it shows.  Here the text is given to the lexer directly.
import { expect } from "vitest";
import { CanonicalSpan } from "../../../src/engine/expressions/transformations/expression/CanonicalSpan.js";
import type { StyledShowable } from "../../../src/engine/utility-error/styled/StyledShowable.js";
import type { InsertListener } from "../../../src/gui-logic/lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import type { CodeCompletionContext } from "../../../src/gui-logic/lex-editor/gui/lexeditor/CodeCompletionContext.js";
import type { EditorLocationAndErrorRecorder } from "../../../src/gui-logic/lex-editor/gui/lexeditor/EditorLocationAndErrorRecorder.js";
import type { Lexer } from "../../../src/gui-logic/lex-editor/gui/lexeditor/Lexer.js";

export const NO_INSERT: InsertListener = { insert: () => {} };

/** An expected error: its location, and parts its message contains (ignoring case), in order. */
export class ExpectedError
{
    public constructor(public readonly location: CanonicalSpan, public readonly expectedMessageParts: readonly string[], public readonly displayLocation: CanonicalSpan | null = null)
    {
    }
}

// The tests' e(start, end, parts...) and e(start, end, displayStart, displayEnd, parts...)
export function e(start: number, end: number, ...rest: (string | number)[]): ExpectedError
{
    if (typeof rest[0] === "number")
        return new ExpectedError(new CanonicalSpan(start, end), rest.slice(2) as string[], new CanonicalSpan(rest[0], rest[1] as number));
    return new ExpectedError(new CanonicalSpan(start, end), rest as string[]);
}

// The tests' MultiSubstringMatcher: each part in order, ignoring case
function containsInOrder(s: string, parts: readonly string[]): boolean
{
    let curIndex = 0;
    for (const sub of parts)
    {
        curIndex = s.toLowerCase().indexOf(sub.toLowerCase(), curIndex);
        if (curIndex === -1)
            return false;
    }
    return true;
}

/**
 * Lexes the text (with the caret at the end, unless given) and checks the errors with a message, as
 * the GUI tests do.  If checkDisplay, also checks their display locations, as BaseTestExpressionEditorError
 * does: an expected error without one is expected at (start, end), widened to one character if empty.
 */
export function checkErrorsAt<E extends StyledShowable, C extends CodeCompletionContext>(lexer: Lexer<E, C>, text: string, caretPos: number, checkDisplay: boolean, ...expected: ExpectedError[]): Lexer.LexerResult<E, C>
{
    const result = lexer.process(text, caretPos, NO_INSERT);
    checkResultErrors(result, text, checkDisplay, ...expected);
    return result;
}

/** The checks of checkErrorsAt, on a given lexer result for the text. */
export function checkResultErrors<E extends StyledShowable, C extends CodeCompletionContext>(result: Lexer.LexerResult<E, C>, text: string, checkDisplay: boolean, ...expected: ExpectedError[]): void
{
    const actualErrors = result.errors.filter(err => err.error.getLength() > 0).sort((a, b) => a.location.compareTo(b.location));
    const expectedErrors = [...expected].sort((a, b) => a.location.compareTo(b.location));
    // As EditorDisplay does when showing the errors:
    const displayOf = (err: EditorLocationAndErrorRecorder.ErrorDetails): string => err.displayLocation !== null ? err.displayLocation.start + "->" + err.displayLocation.end : result.mapContentToDisplay(err.location.start) + "->" + result.mapContentToDisplay(err.location.end);
    const describe = (): string => text + " => " + actualErrors.map(err => err.location.toString() + " (display " + displayOf(err) + ") " + err.error.toPlain()).join("; ");
    expect(actualErrors.length, describe()).toBe(expectedErrors.length);
    for (let i = 0; i < expectedErrors.length; i++)
    {
        const expectedError = expectedErrors[i]!;
        expect(actualErrors[i]!.location.toString(), describe()).toBe(expectedError.location.toString());
        expect(containsInOrder(actualErrors[i]!.error.toPlain(), expectedError.expectedMessageParts), describe() + " should contain " + expectedError.expectedMessageParts.join("…")).toBe(true);
        if (checkDisplay)
        {
            const start = expectedError.location.start;
            const end = expectedError.location.end;
            const displayLocation = expectedError.displayLocation ?? new CanonicalSpan(start, start === end ? end + 1 : end);
            expect(displayOf(actualErrors[i]!), describe()).toBe(displayLocation.start + "->" + displayLocation.end);
        }
    }
}

/** checkErrorsAt with the caret at the end, without checking display locations (as TestTypeEditorError) */
export function checkErrors<E extends StyledShowable, C extends CodeCompletionContext>(lexer: Lexer<E, C>, text: string, ...expected: ExpectedError[]): Lexer.LexerResult<E, C>
{
    return checkErrorsAt(lexer, text, text.length, false, ...expected);
}
