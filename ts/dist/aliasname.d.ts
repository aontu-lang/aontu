declare const ALIAS_RE: RegExp;
declare const ALIAS_NAME_RE: RegExp;
declare const ALIAS_SET: string;
declare const RESERVED_KEY_PREFIX = "\0aontu_";
declare const EXPORT_DECL_NAME = "export";
declare function exportHoldKey(): string;
declare function isExportHoldKey(val: unknown): boolean;
type AliasBind = {
    local: string;
    remote: string;
};
declare function aliasScopedKey(name: string, url: string): string;
declare function aliasBareName(key: string): string;
declare function aliasPathSegment(seg: string): string;
declare function aliasSetItems(text: string): AliasBind[] | undefined;
export { ALIAS_RE, ALIAS_NAME_RE, ALIAS_SET, EXPORT_DECL_NAME, RESERVED_KEY_PREFIX, exportHoldKey, isExportHoldKey, aliasScopedKey, aliasBareName, aliasPathSegment, aliasSetItems, };
export type { AliasBind, };
