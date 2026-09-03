import type { VetFinding } from './vet';
export type FormatOptions = {
    path?: string;
};
export type FormatHooks = {
    same?: (root: any, after: string) => boolean;
    meet?: (before: string, after: string) => boolean;
};
export type FormatReport = {
    verdict: 'formatted';
    text: string;
    changed: boolean;
} | {
    verdict: 'error';
    errors: VetFinding[];
};
export declare function format(src: string, opts?: FormatOptions, hooks?: FormatHooks): FormatReport;
export declare function unifiedDiff(name: string, before: string, after: string): string;
