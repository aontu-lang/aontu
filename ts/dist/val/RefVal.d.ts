import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare function dropPendingMarkWrappers(v: Val): Val;
declare function pendingMarkWrapper(v: any): boolean;
declare function member(v: any, part: any): any;
declare function landPaths(tmpl: Val, base: string[]): void;
declare function landsOnly(tmpl: Val): boolean;
declare function landedAt(ctx: AontuContext, tmpl: Val, to: string[]): Val;
declare class RefVal extends FeatureVal {
    isRef: boolean;
    isGenable: boolean;
    cjo: number;
    absolute: boolean;
    expansion: Val | undefined;
    rxc: number;
    lands: boolean;
    prefix: boolean;
    copyFound: boolean;
    constructor(spec: {
        peg: any[];
        absolute?: boolean;
        prefix?: boolean;
    }, ctx?: AontuContext);
    append(part: any): void;
    unify(peer: Val, ctx: AontuContext): Val;
    find(ctx: AontuContext, snap?: boolean): import("./NilVal").NilVal | Val | undefined;
    detectRefCycle(ctx: AontuContext): boolean;
    plainRefPath(at?: string[]): string[] | undefined;
    same(peer: Val): boolean;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get aliasKey(): string | undefined;
    get aliasName(): string | undefined;
    get spelling(): string;
    get canon(): string;
    gen(ctx: AontuContext): undefined;
    inspection(): string;
}
export { dropPendingMarkWrappers, landPaths, landedAt, landsOnly, member, pendingMarkWrapper, RefVal, };
