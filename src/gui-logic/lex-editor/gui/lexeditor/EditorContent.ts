// Port of xyz.columnal.gui.lexeditor.EditorContent (lex-editor module).
//
// PORT-NOTE: getDisplayText (the display as JavaFX Text nodes) is left to the GUI, which renders
// getDisplay() itself.
import type { CanonicalLocation, DisplayLocation, RawInputLocation } from "../../../../engine/anns/Annotations.js";
import type { StyledShowable } from "../../../../engine/utility-error/styled/StyledShowable.js";
import type { StyledString } from "../../../../engine/utility-error/styled/StyledString.js";
import type { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { Utility } from "../../../../engine/utility/utility/Utility.js";
import type { InsertListener } from "../../../lex-editor-completion/gui/lexeditor/completion/InsertListener.js";
import type { CodeCompletionContext } from "./CodeCompletionContext.js";
import type { EditorLocationAndErrorRecorder } from "./EditorLocationAndErrorRecorder.js";
import type { Lexer } from "./Lexer.js";
import { TopLevelEditor } from "./TopLevelEditor.js";
import type { TextQuickFix } from "./TextQuickFix.js";
import { UndoManager } from "./UndoManager.js";

export class EditorContent<EXPRESSION extends StyledShowable, CODE_COMPLETION_CONTEXT extends CodeCompletionContext> implements InsertListener
{
    private curContent: Lexer.LexerResult<EXPRESSION, CODE_COMPLETION_CONTEXT>;
    private curCaretPosition: CanonicalLocation;
    private curAnchorPosition: CanonicalLocation;
    private readonly lexer: Lexer<EXPRESSION, CODE_COMPLETION_CONTEXT>;
    private readonly caretPositionListeners: EditorContent.CaretPositionListener[] = [];
    private readonly contentListeners: (() => void)[] = [];
    private readonly undoManager: UndoManager;

    public constructor(originalContent: string, lexer: Lexer<EXPRESSION, CODE_COMPLETION_CONTEXT>)
    {
        this.lexer = lexer;
        this.curContent = this.lexer.process(originalContent, 0, this);
        this.curCaretPosition = this.curContent.caretPositions.length > 0 ? this.curContent.caretPositions[0]!.positionInternal : 0;
        this.curAnchorPosition = this.curCaretPosition;
        this.undoManager = new UndoManager(originalContent);
        this.contentListeners.push(() => this.undoManager.contentChanged(this.getText(), this.getCaretPosition()));
    }

    // Java: positionCaret(Focus side) and positionCaret(int pos, boolean alsoSetAnchor)
    public positionCaret(side: TopLevelEditor.Focus): void;
    public positionCaret(pos: CanonicalLocation, alsoSetAnchor: boolean): void;
    public positionCaret(sideOrPos: TopLevelEditor.Focus | CanonicalLocation, alsoSetAnchor?: boolean): void
    {
        if (alsoSetAnchor === undefined)
        {
            const side = sideOrPos as TopLevelEditor.Focus;
            if (side === TopLevelEditor.Focus.LEFT && this.curContent.caretPositions.length > 0)
                this.positionCaret(this.curContent.caretPositions[0]!.positionInternal, true);
            else if (side === TopLevelEditor.Focus.RIGHT && this.curContent.caretPositions.length > 0)
                this.positionCaret(this.curContent.caretPositions[this.curContent.caretPositions.length - 1]!.positionInternal, true);
            return;
        }
        this.curCaretPosition = sideOrPos;
        if (alsoSetAnchor)
            this.curAnchorPosition = sideOrPos;
        this.notifyCaretPositionListeners(EditorContent.CaretMoveReason.CARET_MOVED);
    }

    /** @internal Java: package-visible */
    public notifyCaretPositionListeners(reason: EditorContent.CaretMoveReason): void
    {
        for (const caretPositionListener of this.caretPositionListeners)
        {
            caretPositionListener(this.curCaretPosition, reason);
        }
    }

    public getAnchorPosition(): CanonicalLocation
    {
        return this.curAnchorPosition;
    }

    public getCaretPosition(): CanonicalLocation
    {
        return this.curCaretPosition;
    }

    // Java: replaceSelection(String) and replaceSelection(String, boolean putCaretAtLeadingEdge)
    public replaceSelection(content: string, putCaretAtLeadingEdge: boolean = false): void
    {
        this.replaceText(Math.min(this.curCaretPosition, this.curAnchorPosition), Math.max(this.curCaretPosition, this.curAnchorPosition), content, putCaretAtLeadingEdge ? this.curCaretPosition : null);
    }

    public replaceWholeText(content: string): void
    {
        this.replaceText(0, this.getText().length, content);
    }

    // Java: replaceText(startIncl, endExcl, content) and replaceText(startIncl, endExcl, content, setCaretPos)
    public replaceText(startIncl: CanonicalLocation, endExcl: CanonicalLocation, content: string, setCaretPos: CanonicalLocation | null = null): void
    {
        const newText = this.curContent.adjustedContent.substring(0, startIncl) + content + this.curContent.adjustedContent.substring(endExcl);

        let newCaretPos: RawInputLocation;
        if (this.curCaretPosition < startIncl)
            newCaretPos = this.curCaretPosition;
        else if (this.curCaretPosition <= endExcl)
            newCaretPos = startIncl + content.length;
        else
            newCaretPos = this.curCaretPosition - (endExcl - startIncl) + content.length;
        this.curContent = this.lexer.process(newText, newCaretPos, this);
        if (setCaretPos !== null)
            this.curCaretPosition = setCaretPos;
        else
            this.curCaretPosition = this.curContent.removedChars.map(newCaretPos);
        this.curAnchorPosition = this.curCaretPosition;
        Log.debug(">>>" + this.curContent.adjustedContent + " //" + this.curCaretPosition);
        for (const contentListener of this.contentListeners)
        {
            contentListener();
        }
        this.notifyCaretPositionListeners(EditorContent.CaretMoveReason.TEXT_CHANGED);
    }

    public forceSaveAsIfUnfocused(): void
    {
        this.curContent = this.lexer.process(this.getText(), null, this);
        const oldPos: RawInputLocation = this.getCaretPosition();
        this.curCaretPosition = this.curContent.removedChars.map(oldPos);
        this.curAnchorPosition = this.curCaretPosition;
        for (const contentListener of this.contentListeners)
        {
            contentListener();
        }
        this.notifyCaretPositionListeners(EditorContent.CaretMoveReason.FORCED_SAVE);
    }

    public getText(): string
    {
        return this.curContent.adjustedContent;
    }

    public addChangeListener(listener: () => void): void
    {
        this.contentListeners.push(listener);
    }

    public getLexerResult(): Lexer.LexerResult<EXPRESSION, CODE_COMPLETION_CONTEXT>
    {
        return this.curContent;
    }

    // How many right presses (positive) or left (negative) to
    // reach nearest end of given content?
    // Empty string is treated as the end
    public _test_getCaretMoveDistance(targetContent: string): number
    {
        const targetStartIndex = targetContent.length === 0 ? this.curContent.adjustedContent.length : this.curContent.adjustedContent.indexOf(targetContent);
        if (targetContent.length !== 0 && this.curContent.adjustedContent.indexOf(targetContent, targetStartIndex + 1) !== -1)
            throw new Error("Content " + targetContent + " appears multiple times in editor");
        const targetEndIndex = targetStartIndex + targetContent.length;

        const caretIndex = Utility.findFirstIndex(Utility.mapList(this.curContent.caretPositions, p => p.positionInternal), c => c === this.curCaretPosition);
        if (caretIndex === null)
            throw new Error("Could not find caret position");
        if (this.curCaretPosition < targetStartIndex)
        {
            let hops = 0;
            while (this.curContent.caretPositions[caretIndex + hops]!.positionInternal < targetStartIndex)
                hops += 1;
            return hops;
        }
        else if (this.curCaretPosition > targetEndIndex)
        {
            let hops = 0;
            while (this.curContent.caretPositions[caretIndex + hops]!.positionInternal > targetEndIndex)
                hops -= 1;
            return hops;
        }
        return 0;
    }

    public addCaretPositionListener(listener: EditorContent.CaretPositionListener): void
    {
        this.caretPositionListeners.push(listener);
    }

    public getErrors(): readonly EditorLocationAndErrorRecorder.ErrorDetails[]
    {
        return this.curContent.errors;
    }

    public getValidCaretPositions(): CanonicalLocation[]
    {
        return Utility.mapList(this.curContent.caretPositions, p => p.positionInternal);
    }

    // Note: this is not the caret position, but instead an index
    // into the getValidCaretPositions array.
    public getCaretPosAsValidIndex(): number
    {
        for (let i = 0; i < this.curContent.caretPositions.length; i++)
        {
            if (this.curCaretPosition === this.curContent.caretPositions[i]!.positionInternal)
                return i;
        }
        return 0;
    }

    public prevWordPosition(canStaySame: boolean): CanonicalLocation
    {
        const index = Utility.findLastIndex(this.curContent.wordBoundaryCaretPositions, p => canStaySame ? p <= this.curCaretPosition : p < this.curCaretPosition) ?? 0;
        return this.curContent.wordBoundaryCaretPositions[index]!;
    }

    public nextWordPosition(): CanonicalLocation
    {
        const index = Utility.findFirstIndex(this.curContent.wordBoundaryCaretPositions, p => p > this.curCaretPosition) ?? this.curContent.wordBoundaryCaretPositions.length - 1;
        return this.curContent.wordBoundaryCaretPositions[index]!;
    }

    public suppressBracketMatch(caretPosition: number): boolean
    {
        return this.curContent.suppressBracketMatching.get(caretPosition);
    }

    public areBracketsBalanced(): boolean
    {
        return this.curContent.bracketsAreBalanced;
    }

    public getDisplayCaretPosition(): DisplayLocation
    {
        return this.curContent.mapContentToDisplay(this.getCaretPosition());
    }

    public getDisplayAnchorPosition(): DisplayLocation
    {
        return this.curContent.mapContentToDisplay(this.getAnchorPosition());
    }

    public mapDisplayToContent(clickedCaretPos: DisplayLocation, biasEarlier: boolean): CanonicalLocation
    {
        return this.curContent.mapDisplayToContent(clickedCaretPos, biasEarlier);
    }

    public mapContentToDisplay(contentIndex: CanonicalLocation): DisplayLocation
    {
        return this.curContent.mapContentToDisplay(contentIndex);
    }

    public getDisplay(): StyledString
    {
        return this.curContent.display;
    }

    public getDisplayFor(newCaretPos: CanonicalLocation, toRightOf: unknown): ReadonlyMap<TopLevelEditor.DisplayType, Pair<StyledString, readonly TextQuickFix[]>>
    {
        return this.getLexerResult().infoAndPromptForPosition(newCaretPos, toRightOf);
    }

    public undo(): void
    {
        const possible = this.undoManager.undo();
        if (possible !== null)
        {
            this.replaceWholeText(possible.getFirst());
            this.positionCaret(possible.getSecond(), true);
        }
    }

    public redo(): void
    {
        const possible = this.undoManager.redo();
        if (possible !== null)
        {
            this.replaceWholeText(possible.getFirst());
            this.positionCaret(possible.getSecond(), true);
        }
    }

    public insert(start: CanonicalLocation | null, text: string): void
    {
        const caretPosition = this.getCaretPosition();
        if (start === null || start <= caretPosition)
            this.replaceText(start === null ? caretPosition : start, caretPosition, text);
    }
}

export namespace EditorContent
{
    export enum CaretMoveReason
    {
        FORCED_SAVE, CARET_MOVED, FOCUSED, TEXT_CHANGED,
    }

    // Java: a functional interface
    export type CaretPositionListener = (caretPos: CanonicalLocation, caretMoveReason: CaretMoveReason) => void;
}
