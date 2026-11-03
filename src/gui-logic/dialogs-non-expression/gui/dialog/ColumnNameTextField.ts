// Port of the conversion of xyz.columnal.gui.dialog.ColumnNameTextField (dialogs-non-expression
// module): a column's name.  The field is an ErrorableTextField.vue given this converter.
import { ColumnId } from "../../../../engine/identifiers/id/ColumnId.js";
import { GrammarUtility } from "../../../../engine/parsers/grammar/GrammarUtility.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { ErrorableTextField } from "../../../utility-gui/utility/gui/ErrorableTextField.js";

export namespace ColumnNameTextField
{
    export function convert(text: string): ErrorableTextField.ConversionResult<ColumnId>
    {
        // We automatically remove leading/trailing whitespace, rather than complaining about it.
        // We also convert any whitespace (including multiple chars) into a single space
        const s = GrammarUtility.collapseSpaces(text);
        if (s.length === 0)
            return ErrorableTextField.ConversionResult.error<ColumnId>(TranslationUtility.getStyledString("column.name.error.missing"));
        return ErrorableTextField.checkAlphabet(s, ColumnId.validCharacter, s => new ColumnId(s));
    }
}
