export type ModLock = {
    mod: string;
    v: string;
    canon: string;
    oci: string;
};
export type ModTidyReport = {
    verdict: 'ok' | 'missing' | 'error';
    lock: ModLock[];
    missing: string[];
    unevaluable: string[];
};
export type ModVerifyReport = {
    verdict: 'ok' | 'mismatch' | 'unlocked' | 'missing';
    verified: string[];
    mismatched: {
        mod: string;
        want: string;
        got: string;
    }[];
    unlocked: string[];
    missing: string[];
};
export type ModVendorReport = {
    verdict: 'ok' | 'missing';
    vendored: string[];
    missing: string[];
};
export type ModToolEval = (src: string, path: string) => {
    gen: any;
    hash: string;
    canon: string;
    ok: boolean;
};
export type ModToolOptions = {
    cache?: string;
    eval: ModToolEval;
};
export declare function versionCompare(a: string, b: string): number;
export declare function lockText(entries: ModLock[], options: ModToolOptions): string;
export declare function modTidy(root: string, options: ModToolOptions): ModTidyReport;
export declare function modVerify(root: string, options: ModToolOptions): ModVerifyReport;
export declare function modVendor(root: string, options: ModToolOptions): ModVendorReport;
export declare const MODULE_CONFIG_MEDIA_TYPE = "application/vnd.aontu.module.v1+json";
export declare const MODULE_ANNOTATION_CANON = "com.github.rjrodger.aontu.canon";
export declare const MODULE_ANNOTATION_MAJOR = "com.github.rjrodger.aontu.major";
export type ModManifestReport = {
    verdict: 'ok' | 'breaking' | 'undecided' | 'error';
    mod: string;
    version: string;
    canon: string;
    config: string;
    files: string[];
    annotations: Record<string, string>;
    missing: string[];
    findings: any[];
};
export declare function modManifest(root: string, options: ModToolOptions, against?: string): ModManifestReport;
