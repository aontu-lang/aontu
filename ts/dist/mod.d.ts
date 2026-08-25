export type ModuleRef = {
    path: string;
    major: number;
    hash?: string;
};
export type ModuleFs = {
    existsSync: (p: string) => boolean;
    readFileSync: (p: string, enc: string) => string;
};
export declare function parseModuleRef(spec: string): ModuleRef | undefined;
export declare function moduleDir(store: string, ref: ModuleRef): string;
export declare function projectRoot(from: string, fs: ModuleFs): string;
export declare function lockJson(text: string): string;
export declare function modCacheDir(): string | undefined;
export declare function modCacheDirFor(platform: string, env: Record<string, string | undefined>): string | undefined;
export declare function lockHash(root: string, ref: ModuleRef, fs: ModuleFs): string | undefined;
export type ModuleEval = (src: string, path: string) => {
    gen: any;
    hash: string;
};
export declare const MODULE_MAX_DEPTH = 16;
export type ModuleOptions = {
    cache?: string;
    eval: ModuleEval;
    depth?: number;
};
export type ModuleFound = {
    full: string;
    src: string;
};
export declare function resolveModule(ref: ModuleRef, fromDir: string, fs: ModuleFs, options: ModuleOptions): ModuleFound;
