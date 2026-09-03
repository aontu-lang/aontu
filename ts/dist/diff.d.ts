import type { TrustOptions } from './type';
import type { VetFinding } from './vet';
export type DiffKind = 'added' | 'removed' | 'changed';
export type DiffChange = {
    kind: DiffKind;
    left?: string;
    path: string;
    right?: string;
};
export type DiffReport = {
    changes: DiffChange[];
    findings: VetFinding[];
    ok: boolean;
    same: boolean;
};
export type DiffOptions = {
    leftPath?: string;
    rightPath?: string;
    at?: string;
    trust?: TrustOptions;
    textExt?: string[];
};
export declare function diff(leftSrc: string, rightSrc: string, opts?: DiffOptions): DiffReport;
