// The completions below a text field (Java: AutoComplete on a TextField; its logic is gui-logic's
// AutoComplete.Model), for AutoCompleteField.vue and ErrorableTextField.vue: shown while the field is
// focused, recalculated as the text changes; Up, Down, Page Up and Page Down move the selection; Enter
// or Tab chooses (the selected completion, or what the listener makes of the text); a double click on a
// completion chooses it; Escape or a middle click on the list hides them until the text next changes.
// (docs/gui-spec/autocomplete.md)
import { computed, nextTick, shallowRef, type ComputedRef, type Ref, type ShallowRef } from "vue";
import { AutoComplete } from "../../gui-logic/dialogs-non-expression/gui/dialog/AutoComplete.js";

export interface AutoCompleteState<C extends AutoComplete.Completion>
{
    readonly model: AutoComplete.Model<C>;
    // Java: the window is showing (even with no completions, when the list is hidden)
    readonly showing: ShallowRef<boolean>;
    readonly completions: ComputedRef<readonly C[]>;
    readonly selectedIndex: ComputedRef<number>;
    readonly text: Ref<string>;
    onFocus(): void;
    onBlur(): void;
    onInput(e: Event): void;
    onKeyDown(e: KeyboardEvent): void;
    cellMouseDown(e: MouseEvent, index: number): void;
    listMouseUp(e: MouseEvent): void;
    // Java: setContentDirect, with the caret moved to the end
    setContentDirect(s: string): void;
}

export function useAutoComplete<C extends AutoComplete.Completion>(model: AutoComplete.Model<C>, text: Ref<string>, input: () => HTMLInputElement | null): AutoCompleteState<C>
{
    const showing = shallowRef(false);
    // (The model isn't reactive: this is bumped when it changes)
    const modelVersion = shallowRef(0);
    const completions = computed(() =>
    {
        void modelVersion.value;
        return [...model.completions];
    });
    const selectedIndex = computed(() =>
    {
        void modelVersion.value;
        return model.getSelectedIndex();
    });

    // (From the field's text: a v-model's value is only updated once the parent has re-rendered)
    function update(): void
    {
        model.updateCompletions(AutoComplete.Model.completionText(input()?.value ?? text.value));
        modelVersion.value++;
    }

    function setContentDirect(s: string): void
    {
        text.value = s;
        void nextTick(() => input()?.setSelectionRange(s.length, s.length));
    }

    return {
        model,
        showing,
        completions,
        selectedIndex,
        text,
        onFocus(): void
        {
            update();
            showing.value = true;
        },
        onBlur(): void
        {
            // Focus leaving and we are showing: update completions in case it was recently changed
            if (showing.value)
            {
                update();
                showing.value = false;
            }
        },
        onInput(e: Event): void
        {
            const field = e.target as HTMLInputElement;
            let value = field.value;
            if (model.whitespacePolicy === AutoComplete.WhitespacePolicy.DISALLOW && /\s/.test(value))
            {
                const caret = field.selectionStart ?? value.length;
                const before = value.substring(0, caret).replace(/\s/g, "");
                value = before + value.substring(caret).replace(/\s/g, "");
                field.value = value;
                field.setSelectionRange(before.length, before.length);
            }
            text.value = value;
            update();
            // Show if not already showing:
            if (document.activeElement === field)
                showing.value = true;
        },
        onKeyDown(e: KeyboardEvent): void
        {
            if (!showing.value || e.isComposing)
                return;
            const field = e.target as HTMLInputElement;
            const result = model.keyPressed(e.key, field.value, field.selectionStart ?? field.value.length);
            if (result.consumed)
                e.preventDefault();
            if (result.newText !== null)
                setContentDirect(result.newText);
            if (result.hide)
                showing.value = false;
            modelVersion.value++;
            if (result.consumed)
                void nextTick(() => document.querySelector(".autocomplete .completion-cell.selected")?.scrollIntoView({ block: "nearest" }));
        },
        cellMouseDown(e: MouseEvent, index: number): void
        {
            // (The field keeps the focus)
            e.preventDefault();
            if (e.button !== 0)
                return;
            model.select(index);
            modelVersion.value++;
            if (e.detail === 2)
            {
                const newContent = model.doubleClick(text.value);
                if (newContent !== null)
                    setContentDirect(newContent);
                showing.value = false;
            }
        },
        listMouseUp(e: MouseEvent): void
        {
            if (e.button === 1)
            {
                showing.value = false;
                e.preventDefault();
            }
        },
        setContentDirect,
    };
}
