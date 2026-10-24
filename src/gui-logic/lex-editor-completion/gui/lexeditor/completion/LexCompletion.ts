// Port of xyz.columnal.gui.lexeditor.completion.LexCompletion (lex-editor-completion module).
import type { CanonicalLocation } from "../../../../../engine/anns/Annotations.js";
import { javaEquals, javaObjectsHash } from "../../../../../engine/java/JavaObject.js";
import { Either } from "../../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../engine/utility-adt/utility/adt/Pair.js";
import { StyledString } from "../../../../../engine/utility-error/styled/StyledString.js";
import { LexAutoComplete } from "./LexAutoComplete.js";

/**
 * Note -- the with methods modify this class in-place.
 * This shouldn't be an issue as the methods are only
 * used in a builder style.
 */
export class LexCompletion
{
    public readonly startPos: CanonicalLocation;
    public readonly lastShowPosIncl: CanonicalLocation;
    // If null, completing does not change content, but rather opens the further details in a new window
    public content: string | null = null;
    /** @internal Java: package-visible */
    public display: StyledString;
    public relativeCaretPos: number;
    /** @internal Java: package-visible */
    public selectionBehaviour: LexAutoComplete.LexSelectionBehaviour;
    // Either:
    //   - Left(HTML content)
    //   - Right(HTML file name (e.g. function-abs.html), optional anchor)
    public furtherDetails: Either<string, Pair<string, string | null>> | null = null;
    /** @internal Java: package-visible */
    public sideText: string;

    /**
     * Java has three constructors: the public (startPos, lengthToShowFor, content) and
     * (startIncl, endIncl, display, htmlPageName), and the private one with every field
     * (startPos, lastShowPosIncl, content, display, relativeCaretPos, selectionBehaviour,
     * furtherDetails, sideText), which is only for this class and its anonymous subclasses.
     */
    public constructor(startPos: CanonicalLocation, lengthToShowFor: number, content: string);
    public constructor(startIncl: CanonicalLocation, endIncl: CanonicalLocation, display: StyledString, htmlPageName: string);
    public constructor(startPos: CanonicalLocation, lastShowPosIncl: CanonicalLocation, content: string | null, display: StyledString, relativeCaretPos: number, selectionBehaviour: LexAutoComplete.LexSelectionBehaviour, furtherDetails: Either<string, Pair<string, string | null>> | null, sideText: string);
    public constructor(...args: unknown[])
    {
        if (args.length === 3)
        {
            const [startPos, lengthToShowFor, content] = args as [number, number, string];
            this.startPos = startPos;
            this.lastShowPosIncl = startPos + lengthToShowFor;
            this.content = content;
            this.display = StyledString.s(content);
            this.relativeCaretPos = content.length;
            this.selectionBehaviour = LexAutoComplete.LexSelectionBehaviour.NO_AUTO_SELECT;
            this.sideText = "";
        }
        else if (args.length === 4)
        {
            const [startIncl, endIncl, display, htmlPageName] = args as [number, number, StyledString, string];
            this.startPos = startIncl;
            this.lastShowPosIncl = endIncl;
            this.display = display;
            this.relativeCaretPos = 0;
            this.selectionBehaviour = LexAutoComplete.LexSelectionBehaviour.NO_AUTO_SELECT;
            this.furtherDetails = Either.right(new Pair<string, string | null>(htmlPageName, null));
            this.sideText = "";
        }
        else
        {
            const [startPos, lastShowPosIncl, content, display, relativeCaretPos, selectionBehaviour, furtherDetails, sideText] =
                args as [number, number, string | null, StyledString, number, LexAutoComplete.LexSelectionBehaviour, Either<string, Pair<string, string | null>> | null, string];
            this.startPos = startPos;
            this.lastShowPosIncl = lastShowPosIncl;
            if (content !== null)
                this.content = content;
            this.display = display;
            this.relativeCaretPos = relativeCaretPos;
            this.selectionBehaviour = selectionBehaviour;
            if (furtherDetails !== null)
                this.furtherDetails = furtherDetails;
            this.sideText = sideText;
        }
    }

    // Java: withReplacement(newContent) and withReplacement(newContent, display)
    public withReplacement(newContent: string, display: StyledString = StyledString.s(newContent)): LexCompletion
    {
        this.content = newContent;
        this.display = display;
        return this;
    }

    public withDisplay(display: StyledString): LexCompletion
    {
        this.display = display;
        return this;
    }

    public withCaretPosAfterCompletion(pos: number): LexCompletion
    {
        this.relativeCaretPos = pos;
        return this;
    }

    public withSelectionBehaviour(selectionBehaviour: LexAutoComplete.LexSelectionBehaviour): LexCompletion
    {
        this.selectionBehaviour = selectionBehaviour;
        return this;
    }

    public withFurtherDetailsURL(url: string | null): LexCompletion
    {
        if (url !== null)
            this.furtherDetails = Either.right(new Pair<string, string | null>(url, null));
        return this;
    }

    public withFurtherDetailsHTMLContent(content: string): LexCompletion
    {
        this.furtherDetails = Either.left(content);
        return this;
    }

    public withSideText(sideText: string): LexCompletion
    {
        this.sideText = sideText;
        return this;
    }

    /** TS-only: the display, side text and selection behaviour (package-visible in Java), for the completion list. */
    public getDisplay(): StyledString { return this.display; }
    public getSideText(): string { return this.sideText; }
    public getSelectionBehaviour(): LexAutoComplete.LexSelectionBehaviour { return this.selectionBehaviour; }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof LexCompletion)) return false;
        const that = o;
        return this.startPos === that.startPos &&
                this.lastShowPosIncl === that.lastShowPosIncl &&
                this.relativeCaretPos === that.relativeCaretPos &&
                javaEquals(this.content, that.content) &&
                this.display.equals(that.display) &&
                this.selectionBehaviour === that.selectionBehaviour &&
                javaEquals(this.furtherDetails, that.furtherDetails) &&
                javaEquals(this.sideText, that.sideText);
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.startPos, this.lastShowPosIncl, this.content, this.display, this.relativeCaretPos, this.selectionBehaviour, this.furtherDetails, this.sideText);
    }

    // Used for testing:
    public toString(): string
    {
        return "LexCompletion{" +
            "startPos=" + this.startPos +
            ", lastShowPosIncl=" + this.lastShowPosIncl +
            ", content='" + String(this.content) + "'" +
            ", display=" + this.display.toString() +
            ", relativeCaretPos=" + this.relativeCaretPos +
            ", selectionBehaviour=" + LexAutoComplete.LexSelectionBehaviour[this.selectionBehaviour] +
            ", furtherDetails=" + String(this.furtherDetails) +
            ", sideText='" + this.sideText + "'" +
            "}";
    }

    public offsetBy(offsetBy: CanonicalLocation): LexCompletion
    {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const original = this;
        return new class extends LexCompletion
        {
            public override showFor(caretPos: CanonicalLocation): boolean
            {
                return original.showFor(caretPos - offsetBy);
            }
        }(this.startPos + offsetBy, this.lastShowPosIncl + offsetBy, this.content, this.display, this.relativeCaretPos, this.selectionBehaviour, this.furtherDetails, this.sideText);
    }

    public showFor(caretPos: CanonicalLocation): boolean
    {
        return this.startPos <= caretPos && caretPos <= this.lastShowPosIncl;
    }

    public copyNoShowAtFirstPos(): LexCompletion
    {
        return new class extends LexCompletion
        {
            public override showFor(caretPos: CanonicalLocation): boolean
            {
                return caretPos === this.startPos ? false : super.showFor(caretPos);
            }
        }(this.startPos, this.lastShowPosIncl, this.content, this.display, this.relativeCaretPos, this.selectionBehaviour, this.furtherDetails, this.sideText);
    }
}
