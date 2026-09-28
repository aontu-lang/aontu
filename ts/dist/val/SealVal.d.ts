import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class SealVal extends FeatureVal {
    isSeal: boolean;
    closed: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    unify(peer: Val, _ctx: AontuContext): Val;
    get canon(): "close()" | "open()";
    same(peer: any): boolean;
}
declare function sealCjo(closed: boolean): number;
export { SealVal, sealCjo, };
