// Port of xyz.columnal.data.RenameOnEdit (data module), a Java functional interface with static members.
import type { TableId } from "../../identifiers/id/TableId.js";
import type { Table } from "./Table.js";

export type RenameOnEdit = (old: Table) => TableId;

export const RenameOnEdit = {
    UNNEEDED: ((old: Table) => old.getId()) as RenameOnEdit,

    renameToSuggested(newTableId: TableId): RenameOnEdit
    {
        return _old => newTableId;
    },

    ifOldAuto(newTableId: TableId): RenameOnEdit
    {
        return old => old.getId().equals(old.getSuggestedName()) ? newTableId : old.getId();
    },
};
