export type ModuleRef = {
    path: string;
    hash?: string;
};
export type ModuleFs = {
    existsSync: (p: string) => boolean;
    readFileSync: (p: string, enc: string) => string;
};
export declare const ALIAS_PREFIX = "alias:";
export declare function parseModuleRef(spec: string): ModuleRef | undefined;
export declare function isAlias(path: string): boolean;
export declare const MODULE_MAX_PATH = 512;
export declare const MODULE_MAX_ELEMS = 32;
export declare function validateModulePath(path: string): string | undefined;
export declare function localFileExt(path: string): string | undefined;
export declare function escapeElem(elem: string): string;
export declare function moduleDir(store: string, path: string): string;
export declare const PKG_FILE = "pkg.aontu";
export declare const LOCK_FILE = "pkg-lock.aontu";
export declare const META_DIR = "aontu_meta";
export declare const VENDOR_DIR = "vendor";
export declare function projectRoots(from: string, fs: ModuleFs): string[];
export declare function lockJson(text: string): string;
export declare function modCacheDir(): string | undefined;
export declare function modCacheDirFor(platform: string, env: Record<string, string | undefined>): string | undefined;
export declare function cacheStoreDir(cache: string, hash: string, pkg: string): string;
export declare function cacheDownloadDir(cache: string, pkg: string): string;
export declare function cacheSeenDir(cache: string, pkg: string): string;
export type LockPins = {
    canon?: string;
    pkg?: string;
};
export declare function lockEntry(root: string, key: string, fs: ModuleFs): LockPins | undefined;
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
export declare const MODULE_REFUSAL_CODES: ReadonlySet<string>;
export declare function refuseLocalFile(path: string): never;
export declare function resolveModule(ref: ModuleRef, fromDir: string, fs: ModuleFs, options: ModuleOptions): ModuleFound;
