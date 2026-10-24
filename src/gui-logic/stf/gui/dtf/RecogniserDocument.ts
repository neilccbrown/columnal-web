// Port of xyz.columnal.gui.dtf.RecogniserDocument (stf module).
import { Platform } from "../../../../engine/java/Platform.js";
import type { Either } from "../../../../engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../../engine/utility-error/error/InternalException.js";
import type { SimulationSupplierInt } from "../../../../engine/utility-functional/utility/function/simulation/SimulationSupplierInt.js";
import { Log } from "../../../../engine/utility/log/Log.js";
import { ParseProgress } from "../../../../engine/utility/utility/ParseProgress.js";
import type { Value } from "../../../../engine/utility/utility/Value.js";
import { Workers } from "../../../../engine/utility/utility/Workers.js";
import type { CaretPositionMapper } from "./CaretPositionMapper.js";
import { DisplayDocument } from "./DisplayDocument.js";
import type { KeyCode, MenuItem } from "./Document.js";
import { Recogniser } from "./Recogniser.js";

/**
 * A document which can display differently when unfocused.
 * When focused, behaves like plain text, but also uses a Recogniser
 * to potentially show errors.
 */
export class RecogniserDocument<V extends Value> extends DisplayDocument
{
    /**
     * PORT-NOTE: Java shows a JavaFX Alert (an error dialog with an OK button, whose button has the
     * style class "ok-button") and waits for it to be closed.  The GUI sets this to show its own,
     * calling afterClose once it is closed.
     */
    public static showErrorAlert: (message: string, afterClose: () => void) => void = (message, afterClose) =>
    {
        Log.log(message);
        afterClose();
    };

    private readonly recogniser: Recogniser<V>;
    private readonly saveChange: RecogniserDocument.Saver<V>;
    private readonly relinquishFocus: (keyCode: KeyCode) => void;
    // Java: Class<V>, used to check the value's class; here the class name as given by the creator
    private readonly itemClass: string;
    private readonly checkEditable: SimulationSupplierInt<boolean> | null;
    private readonly getAdditionalMenuItemsFn: ((focused: boolean) => readonly MenuItem[]) | null;
    private curErrorPosition: number | null = null;
    private valueOnFocusGain: string;
    private latestValue!: Either<Recogniser.ErrorDetails, Recogniser.SuccessDetails<V>>;
    private onFocusLost: (() => void) | null = null;
    private unfocusedDocument!: Pair<readonly Pair<ReadonlySet<string>, string>[], CaretPositionMapper>;

    public constructor(initialContent: string, valueClass: string, recogniser: Recogniser<V>, checkStartEdit: SimulationSupplierInt<boolean> | null, saveChange: RecogniserDocument.Saver<V>, relinquishFocus: (keyCode: KeyCode) => void, getAdditionalMenuItems: ((focused: boolean) => readonly MenuItem[]) | null)
    {
        super(initialContent);
        this.itemClass = valueClass;
        this.recogniser = recogniser;
        this.saveChange = saveChange;
        this.relinquishFocus = relinquishFocus;
        this.checkEditable = checkStartEdit;
        this.getAdditionalMenuItemsFn = getAdditionalMenuItems;
        this.valueOnFocusGain = initialContent;
        this.recognise(false);

    }

    public override focusChanged(focused: boolean): void
    {
        if (focused && this.checkEditable !== null)
        {
            const checkEditableFinal = this.checkEditable;
            Workers.onWorkerThread("Check editable", Workers.Priority.FETCH, () =>
            {
                try
                {
                    if (!checkEditableFinal())
                    {
                        // Cancel the edit:
                        Platform.runLater(() =>
                        {
                            this.replaceText(0, this.getLength(), this.valueOnFocusGain);
                            this.defocus("ESCAPE");
                            RecogniserDocument.showErrorAlert("Cannot edit value on a row with an error in the identifier column.", () =>
                            {
                                // Restore focus to reasonable position:
                                this.defocus("ESCAPE");
                            });
                        });
                    }
                }
                catch (e)
                {
                    if (!(e instanceof InternalException))
                        throw e;
                    Log.log(e);
                    // Just have to ignore...
                }
            });
        }

        super.focusChanged(focused);
        if (!focused)
        {
            this.recognise(this.getText() !== this.valueOnFocusGain);
            this.notifyListeners();
            if (this.onFocusLost !== null)
                this.onFocusLost();
        }
        else
        {
            this.valueOnFocusGain = this.getText();
        }
    }

    private recognise(save: boolean): void
    {
        const text = this.getText();
        this.latestValue = this.recogniser.process(ParseProgress.fromStart(text), false)
                        .flatMap(s => s.requireEnd());
        const reset = (): void =>
        {
            this.replaceText(0, this.getLength(), this.valueOnFocusGain);
            this.recognise(false);
            this.notifyListeners();
            if (this.onFocusLost !== null)
                this.onFocusLost();
        };
        const saveDetails: Pair<string, V | null> = this.latestValue.either<Pair<string, V | null>>(err =>
        {
            this.curErrorPosition = err.errorPosition;
            return new Pair<string, V | null>(text, null);
        }, (x: Recogniser.SuccessDetails<V>) =>
        {
            this.curErrorPosition = null;
            const value = x.value;
            return new Pair<string, V | null>(x.immediateReplacementText, value);
        });
        this.unfocusedDocument = new Pair<readonly Pair<ReadonlySet<string>, string>[], CaretPositionMapper>(RecogniserDocument.makeStyledSpans(this.curErrorPosition, saveDetails.getFirst()), n => n);
        if (save)
        {
            if (saveDetails.getFirst() !== text)
                this.replaceText(0, text.length, saveDetails.getFirst());
            this.saveChange(saveDetails.getFirst(), saveDetails.getSecond(), reset);
        }
    }

    public override getStyledSpans(focused: boolean): Pair<ReadonlySet<string>, string>[]
    {
        if (!focused)
            return [...this.unfocusedDocument.getFirst()];

        return RecogniserDocument.makeStyledSpans(this.curErrorPosition, this.getText());
    }

    private static makeStyledSpans(curErrorPosition: number | null, text: string): Pair<ReadonlySet<string>, string>[]
    {
        if (curErrorPosition === null || curErrorPosition >= text.length)
        {
            return [new Pair<ReadonlySet<string>, string>(new Set<string>(), text)];
        }
        else
        {
            return [
                    new Pair<ReadonlySet<string>, string>(new Set<string>(), text.substring(0, curErrorPosition)),
                    new Pair<ReadonlySet<string>, string>(new Set(["input-error"]), text.substring(curErrorPosition, curErrorPosition + 1)),
                    new Pair<ReadonlySet<string>, string>(new Set<string>(), text.substring(curErrorPosition + 1)),
            ];
        }
    }

    public override hasError(): boolean
    {
        return this.curErrorPosition !== null;
    }

    public override defocus(defocusCause: KeyCode): void
    {
        this.relinquishFocus(defocusCause);
    }

    public getLatestValue(): Either<Recogniser.ErrorDetails, V>
    {
        return this.latestValue.map((x: Recogniser.SuccessDetails<V>) => x.value);
    }

    // Note: this is not a list of listeners, there's only one.
    public setOnFocusLost(onFocusLost: () => void): void
    {
        this.onFocusLost = onFocusLost;
    }

    public getItemClass(): string
    {
        return this.itemClass;
    }

    public setUnfocusedDocument(unfocusedDocument: readonly Pair<ReadonlySet<string>, string>[], positionMapper: CaretPositionMapper): void
    {
        this.unfocusedDocument = new Pair(unfocusedDocument, positionMapper);
    }

    public override mapCaretPos(pos: number): number
    {
        return this.unfocusedDocument.getSecond()(pos);
    }

    public override setAndSave(content: string): void
    {
        this.replaceText(0, this.getText().length, content);
        this.recognise(true);
        // Must notify listeners again after recognition to update display correctly:
        this.notifyListeners();
    }

    public override getUndo(): string | null
    {
        return this.valueOnFocusGain;
    }

    public override getAdditionalMenuItems(focused: boolean): readonly MenuItem[]
    {
        return this.getAdditionalMenuItemsFn === null ? [] : this.getAdditionalMenuItemsFn(focused);
    }
}

export namespace RecogniserDocument
{
    // Java: an interface with one method, save(text, recognisedValue, resetGraphics)
    export type Saver<V> = (text: string, recognisedValue: V | null, resetGraphics: () => void) => void;
}
