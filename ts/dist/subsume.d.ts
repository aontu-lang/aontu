import type { TrustOptions } from './type';
import type { VetFinding } from './vet';
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
};
export type SubsumeReport = {
    verdict: SubsumeVerdict;
    findings: VetFinding[];
};
type SubState = {
    profile: SubsumeProfile;
    findings: VetFinding[];
    generalUrl: string;
    specificUrl: string;
};
type Tri = 'yes' | 'no' | 'undecided';
export declare function effectiveDefault(v: any): any;
export declare function subsumeNode(state: SubState, path: string[], g0: any, s0: any): Tri;
/**
 * Does `generalSrc` subsume `specificSrc` — is every instance the
 * specific admits admitted by the general too?
 *
 * Both sources are evaluated fresh (single-use trees make this
 * mandatory), and the recursion runs on the finished values. The
 * verdict is three-valued plus `error` (a source that does not stand up
 * on its own, mirroring vet's schema-error verdict); findings reuse
 * G2's object with class `compat`.
 */
export declare function subsume(generalSrc: string, specificSrc: string, opts?: SubsumeOptions): SubsumeReport;
export {};
