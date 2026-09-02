import type { VetFinding } from './vet';
import type { TrustOptions } from './type';
import { Provenance } from './provenance';
import type { SubsumeProfile } from './subsume';
export type ViewVerdict = 'rendered' | 'lossy' | 'error';
export type ViewKind = 'tree' | 'matrix' | 'graph' | 'layer' | 'sets' | 'layers' | 'ladder' | 'poset';
export type ViewProfile = 'text' | 'mermaid' | 'dot' | 'er';
export type ViewOrder = 'canon' | 'partition';
export type ViewLoss = {
    code: string;
    count: number;
    detail?: string[];
};
export type ViewDoc = {
    src: string;
    path?: string;
    name?: string;
};
export type ViewReport = {
    verdict: ViewVerdict;
    kind: ViewKind;
    text?: string;
    loss: ViewLoss[];
    errors?: VetFinding[];
};
export type ViewOptions = {
    kind?: ViewKind;
    as?: ViewProfile;
    path?: string;
    trust?: TrustOptions;
    at?: string;
    maxRows?: number;
    relation?: string;
    roots?: string[];
    order?: ViewOrder;
    closure?: boolean;
    relations?: string[];
    groupBy?: string;
    layers?: string[];
    label?: string;
    sets?: string;
    member?: string;
    universe?: string;
    minDegree?: number;
    maxCols?: number;
    minSize?: number;
    profile?: SubsumeProfile;
    docs?: ViewDoc[];
};
export type ViewPosetDoc = {
    src: string;
    path?: string;
    label: string;
};
type Doc = ViewPosetDoc;
export type ViewCompare = (general: Doc, specific: Doc, options: ViewOptions) => {
    verdict: string;
    code: string;
};
export type ViewHooks = {
    compare?: ViewCompare;
    provenance?: () => Provenance;
};
export declare function view(src: string, opts?: ViewOptions, hooks?: ViewHooks): ViewReport;
export declare function viewTree(src: string, opts?: ViewOptions): ViewReport;
export {};
