import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare function pendingMarkWrapper(v: any): boolean;
declare class RefVal extends FeatureVal {
    isRef: boolean;
    isGenable: boolean;
    cjo: number;
    absolute: boolean;
    prefix: boolean;
    constructor(spec: {
        peg: any[];
        absolute?: boolean;
        prefix?: boolean;
    }, ctx?: AontuContext);
    append(part: any): void;
    unify(peer: Val, ctx: AontuContext): Val;
    find(ctx: AontuContext, snap?: boolean): import("./NilVal").NilVal | Val | undefined;
    detectRefCycle(ctx: AontuContext): boolean;
    plainRefPath(): string[] | undefined;
    same(peer: Val): boolean;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get canon(): string;
    gen(ctx: AontuContext): undefined;
    inspection(): string;
}
export { pendingMarkWrapper, RefVal, };
