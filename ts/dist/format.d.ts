import type { VetFinding } from './vet';
export type FormatOptions = {
    path?: string;
    lint?: boolean;
};
export type LintFinding = {
    rule: 'style/key-case' | 'style/repeat';
    line: number;
    col: number;
    message: string;
};
export type FormatHooks = {
    same?: (root: any, after: string) => boolean;
    meet?: (before: string, after: string) => boolean;
};
export type FormatReport = {
    verdict: 'formatted';
    text: string;
    changed: boolean;
    findings: LintFinding[];
} | {
    verdict: 'error';
    errors: VetFinding[];
};
export declare function format(src: string, opts?: FormatOptions, hooks?: FormatHooks): FormatReport;
export declare function unifiedDiff(name: string, before: string, after: string): string;
