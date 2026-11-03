// Saving a file by downloading it (Java: writing to a file chosen in a FileChooser's save dialog).
export function download(fileName: string, content: BlobPart, type: string): void
{
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
