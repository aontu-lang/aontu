import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare function prefInnerPeg(v: Val): Val;
declare class PrefVal extends FeatureVal {
    isPref: boolean;
    isGenable: boolean;
    cjo: number;
    superpeg: Val;
    rank: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    private resuper;
    unify(peer: Val, ctx: AontuContext): Val;
    same(peer: Val): boolean;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get canon(): string;
    gen(ctx?: AontuContext): any;
}
export { PrefVal, prefInnerPeg, };
