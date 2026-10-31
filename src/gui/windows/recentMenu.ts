// Java: InitialWindow.makeRecentProjectMenu: a menu item per recent project.
import type { MenuItem } from "../components/menus/menus.js";
import type { ProjectSummary } from "../project/ProjectStore.js";

export function recentProjectItems(recent: readonly ProjectSummary[], open: (id: string) => void): MenuItem[]
{
    return recent.map(p => ({
        kind: "item",
        id: "",
        // Java: the file's path
        label: { text: p.name, mnemonicIndex: null, shortcut: null },
        onAction: () => open(p.id),
        styleClasses: ["recent-project"],
        disabled: false,
    }));
}
