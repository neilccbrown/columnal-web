// Types for funcdocHtml.mjs, which tests import.
export interface FuncdocPage { title: string; bodyClass: string | null; body: string }
export function funcdocPages(allXmlPath: string, funcdocXmlPaths: readonly string[]): { [fileName: string]: FuncdocPage };
export function brokenLinks(pages: { [fileName: string]: FuncdocPage }): [page: string, href: string][];
