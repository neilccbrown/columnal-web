// Menus as data, made as Java's GUI.menuItem, menuItemPos, menu and checkMenuItem make JavaFX menu
// items: the text and shortcut from the translation (label()), and the class "id-<key with - for .>"
// (GUI.makeId), by which the Java tests find them.  ContextMenu.vue shows them.
import type { LocalizableKey } from "../../../engine/anns/Annotations.js";
import { label, type Label } from "../../i18n.js";

export type MenuEntry = MenuItem | CheckMenuItem | SubMenu | MenuSeparator;

export interface MenuItem
{
    readonly kind: "item";
    readonly id: string;
    readonly label: Label;
    // Given the centre of the menu, in client coordinates (Java: menuItemPos):
    readonly onAction: (menuCentre: { x: number, y: number }) => void;
    readonly styleClasses: readonly string[];
    readonly disabled: boolean;
}

export interface CheckMenuItem
{
    readonly kind: "check";
    readonly id: string;
    readonly label: Label;
    readonly checked: boolean;
    readonly onChange: (checked: boolean) => void;
}

export interface SubMenu
{
    readonly kind: "menu";
    readonly id: string;
    readonly label: Label;
    readonly items: readonly MenuEntry[];
}

export interface MenuSeparator
{
    readonly kind: "separator";
}

/** Java: GUI.makeId */
export function makeId(key: LocalizableKey): string
{
    return "id-" + key.replaceAll(".", "-");
}

export function menuItem(key: LocalizableKey, onAction: () => void, ...styleClasses: string[]): MenuItem
{
    return menuItemPos(key, () => onAction(), ...styleClasses);
}

export function menuItemPos(key: LocalizableKey, onAction: (menuCentre: { x: number, y: number }) => void, ...styleClasses: string[]): MenuItem
{
    return { kind: "item", id: makeId(key), label: label(key), onAction, styleClasses, disabled: false };
}

/** The item, disabled (JavaFX: setDisable(true)) */
export function disabled(item: MenuItem): MenuItem
{
    return { ...item, disabled: true };
}

export function checkMenuItem(key: LocalizableKey, checked: boolean, onChange: (checked: boolean) => void): CheckMenuItem
{
    return { kind: "check", id: makeId(key), label: label(key), checked, onChange };
}

export function menu(key: LocalizableKey, ...items: MenuEntry[]): SubMenu
{
    return { kind: "menu", id: makeId(key), label: label(key), items };
}

export function separator(): MenuSeparator
{
    return { kind: "separator" };
}
