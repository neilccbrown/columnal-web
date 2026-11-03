// Port of the conversion of xyz.columnal.gui.table.TableNameTextField (table-gui module): a table's
// name, which must not be another table's.  The field is an ErrorableTextField.vue given this
// converter.
//
// PORT-NOTE: Java asked the TableManager (isFreeId, which also finds the ids differing only in case);
// here the GUI gives the ids of the tables, from the engine.
import { TableId } from "../../../../engine/identifiers/id/TableId.js";
import { GrammarUtility } from "../../../../engine/parsers/grammar/GrammarUtility.js";
import { TranslationUtility } from "../../../../engine/utility/utility/TranslationUtility.js";
import { ErrorableTextField } from "../../../utility-gui/utility/gui/ErrorableTextField.js";

export namespace TableNameTextField
{
    export function converter(usedIds: readonly TableId[] | null, editingId: TableId | null, blankAllowed: boolean): (text: string) => ErrorableTextField.ConversionResult<TableId>
    {
        return text =>
        {
            // We automatically remove leading/trailing whitespace, rather than complaining about it.
            // We also convert any whitespace (including multiple chars) into a single space
            const s = GrammarUtility.collapseSpaces(text);
            if (s.length === 0)
            {
                if (blankAllowed)
                    return ErrorableTextField.ConversionResult.success(new TableId(s));
                else
                    return ErrorableTextField.ConversionResult.error<TableId>(TranslationUtility.getStyledString("table.name.error.missing"));
            }
            const tableId = new TableId(s);
            // Java: TableManager.isFreeId(tableId, similar)
            const similar = (usedIds ?? []).filter(t => t.getRaw().toLowerCase() === tableId.getRaw().toLowerCase());
            const free = !(usedIds ?? []).some(t => t.equals(tableId));
            // If we match the beginning ID, that is OK, otherwise the ID must be free:
            if (tableId.equals(editingId) || free)
            {
                if (similar.length === 0)
                    return ErrorableTextField.ConversionResult.success(tableId);
                else
                    return ErrorableTextField.ConversionResult.success(tableId, TranslationUtility.getString("table.name.similar", similar.map(t => "\"" + t.getOutput() + "\"").join(", ")));
            }
            else
            {
                return ErrorableTextField.ConversionResult.error<TableId>(TranslationUtility.getStyledString("table.name.exists", s));
            }
        };
    }
}
