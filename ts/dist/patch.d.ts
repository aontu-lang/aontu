import type { VetFinding, VetVerdict } from './vet';
export type PatchOptions = {
    entryPath?: string;
    overlayPath?: string;
    inPlace?: boolean;
};
export type PatchReplacement = {
    col: number;
    file: string;
    from: string;
    path: string;
    row: number;
    to: string;
};
export type PatchReport = {
    overlay: string;
    appended: string[];
    replaced: PatchReplacement[];
    verdict: VetVerdict;
    findings: VetFinding[];
};
export declare function parseAssignment(text: string): {
    path: string;
    value: string;
} | undefined;
export declare function overlayLine(path: string, value: string): string;
export declare function offsetAt(src: string, row: number, col: number): number;
export declare function spanAt(src: string, site: {
    row: number;
    col: number;
    len: number;
}): string | undefined;
export declare function spanHolds(src: string, site: {
    row: number;
    col: number;
    len: number;
}, expect: string): boolean;
export declare function spanValue(src: string): {
    canon: string;
    concrete: boolean;
} | undefined;
export declare function patch(entrySrc: string, overlaySrc: string, assignments: string[], opts?: PatchOptions): PatchReport;
