// Writing to and reading from the system clipboard (Java: ClipboardUtils put the content on the system
// clipboard, and read it from there).
// The engine gives the content as a map from MIME type to text: "text/plain", and Columnal's own
// format ("application/records"), which a web page can only write as a "web " custom format, where the
// browser supports them.
import { Log } from "../engine/utility/log/Log.js";

export async function writeClipboard(content: Readonly<Record<string, string>>): Promise<void>
{
    const items: Record<string, Blob> = {};
    for (const [type, text] of Object.entries(content))
    {
        const webType = type === "text/plain" ? type : "web " + type;
        if (typeof ClipboardItem !== "undefined" && ClipboardItem.supports(webType))
            items[webType] = new Blob([text], { type: webType === "text/plain" ? type : webType });
    }
    try
    {
        if (Object.keys(items).length > 0)
            await navigator.clipboard.write([new ClipboardItem(items)]);
        else if (content["text/plain"] !== undefined)
            await navigator.clipboard.writeText(content["text/plain"]);
    }
    catch (e)
    {
        Log.log("Copying to the clipboard", e);
    }
}

/**
 * Java: ClipboardUtils.loadValuesFromClipboard's reading of the clipboard: its Columnal content (the
 * "web " format), or null if there is none (or it can't be read).
 */
export async function readClipboardRecords(): Promise<string | null>
{
    try
    {
        for (const item of await navigator.clipboard.read())
        {
            if (item.types.includes("web application/records"))
                return await (await item.getType("web application/records")).text();
        }
    }
    catch (e)
    {
        Log.log("Pasting from the clipboard", e);
    }
    return null;
}
