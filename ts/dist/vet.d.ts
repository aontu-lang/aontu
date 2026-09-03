import type { TrustOptions, Val } from './type';
export type VetVerdict = 'valid' | 'invalid' | 'incomplete' | 'error';
export type VetRole = 'data' | 'schema';
export type VetSite = {
    file: string;
    row: number;
    col: number;
    len: number;
    role: VetRole;
    src?: string;
    value?: string;
};
export type VetFinding = {
    code: string;
    class: string;
    severity: 'error' | 'warning' | 'info';
    path: string;
    message: string;
    hint?: string;
    sites: VetSite[];
    expected?: string;
    actual?: string;
    note?: string;
};
export type VetReport = {
    verdict: VetVerdict;
    truncated: boolean;
    findings: VetFinding[];
};
export type VetOptions = {
    at?: string;
    closed?: boolean;
    partial?: boolean;
    maxErrors?: number;
    schemaUrl?: string;
    dataUrl?: string;
    schemaPath?: string;
    dataPath?: string;
    trust?: TrustOptions;
    textExt?: string[];
};
export declare const VET_MAX_ERRORS = 20;
export declare function displayFile(url: string, label: string, path?: string): string;
export declare function failureFinding(ctx: any, url?: string, failed?: any): VetFinding;
export declare function anchorAt(root: any, at: string): Val | undefined;
export declare function throughResidue(v: any): any;
export declare function vet(schemaSrc: string, dataSrc: string, opts?: VetOptions): VetReport;
