import type { TrustOptions } from './type';
import type { VetFinding, VetSite } from './vet';
export type SubsumeVerdict = 'subsumes' | 'does_not_subsume' | 'undecided' | 'error';
export type SubsumeProfile = 'values' | 'defaults' | 'gen';
export type SubsumeOptions = {
    profile?: SubsumeProfile;
    at?: string;
    generalUrl?: string;
    specificUrl?: string;
    generalPath?: string;
    specificPath?: string;
    trust?: TrustOptions;
    textExt?: string[];
};
export type SubsumeReport = {
    verdict: SubsumeVerdict;
    findings: VetFinding[];
};
type SubState = {
    profile: SubsumeProfile;
    distributing?: boolean;
    findings: VetFinding[];
    generalUrl: string;
    specificUrl: string;
};
type Tri = 'yes' | 'no' | 'undecided';
export declare function pathText(path: string[]): string;
export declare function siteOf(v: any, role: string, url: string): VetSite;
export declare function effectiveDefault(v: any): any;
export declare function subsumeNode(state: SubState, path: string[], g0: any, s0: any): Tri;
export declare function subsume(generalSrc: string, specificSrc: string, opts?: SubsumeOptions): SubsumeReport;
export {};
