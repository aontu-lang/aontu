import type { VetReport, VetSite } from './vet';
export type SourceSpan = {
    start: number;
    end: number;
    frame: number;
    keyword: string;
    absolute: string;
    enters?: number;
    required?: true;
};
export type SourceMap = {
    sha256: string;
    spans: SourceSpan[];
};
export type OutputUnit = {
    valid: boolean;
    keywordLocation: string;
    absoluteKeywordLocation?: string;
    instanceLocation: string;
    error?: string;
    errors?: OutputUnit[];
};
export type VetOutput = {
    valid: boolean;
} | OutputUnit;
export declare function textSha(text: string): string;
export declare function fragmentOf(ptr: string): string;
export declare function pointerOf(segs: string[]): string;
export declare function carry(printed: string, formatted: string, ranges: {
    start: number;
    end: number;
}[]): ({
    start: number;
    end: number;
} | undefined)[];
export declare function readSourceMap(text: string): SourceMap | undefined;
export type Located = {
    keyword: string;
    absolute: string;
    instance: string[];
};
export declare function locate(map: SourceMap, text: string, site: VetSite, instance: string[], missing: boolean): Located | undefined;
export declare function vetOutput(report: VetReport, form: 'flag' | 'basic', schema?: {
    text: string;
    map: SourceMap;
}): VetOutput;
