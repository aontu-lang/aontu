import type { Val, FST, AontuOptions } from './type';
import { NilVal } from './val/NilVal';
type AontuContextConfig = {
    cc?: number;
    err?: any[];
    explain?: any[] | boolean | null;
    prov?: any;
    fs?: any;
    path?: string[];
    root?: Val;
    seen?: Record<string, number>;
    seenI?: number;
    src?: string;
    srcpath?: string;
    vars?: Record<string, Val>;
    vc?: number;
    collect?: boolean;
    opts?: AontuOptions;
    deps?: Record<string, any>;
};
declare class AontuContext {
    root?: Val;
    path: string[];
    vc: number;
    cc: number;
    settle: boolean;
    vars: Record<string, Val>;
    src?: string;
    fs?: FST;
    seenI: number;
    seen: Record<string, number>;
    collect: boolean;
    probe: boolean;
    prov?: any;
    err: any[];
    explain: any[] | null;
    srcpath?: string;
    deps: Record<string, any>;
    opts: AontuOptions;
    _pathstr: string | undefined;
    _pathidx: number | undefined;
    _pathmap: Map<string, number>;
    _pathTrie: Map<number, Map<string, {
        idx: number;
        path: string[];
    }>>;
    _pathidxNext: {
        n: number;
    };
    _depth: {
        n: number;
    };
    budget: {
        passes: number;
        revisits: number;
        depth: number;
    };
    manifest: {
        path: string;
        capability: string;
    }[];
    _trialMode?: boolean;
    _childCache?: Map<string, AontuContext>;
    constructor(cfg: AontuContextConfig);
    clone(cfg: {
        root?: Val;
        path?: string[];
        err?: any[];
        collect?: boolean;
        explain?: any[] | boolean | null;
    }): AontuContext;
    descend(key: string): AontuContext;
    addopts(opts?: AontuOptions): void;
    adderr(err: NilVal): void;
    errmsg(): string;
    find(path: string[]): Val | undefined;
    get pathidx(): number;
    get pathstr(): string;
}
export { AontuContext, AontuContextConfig };
