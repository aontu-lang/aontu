type UriParts = {
    scheme?: string;
    authority?: string;
    path: string;
    query?: string;
    fragment?: string;
};
declare function parseUri(s: string): UriParts;
declare function resolveUri(base: string, ref: string): string;
export { parseUri, resolveUri, };
