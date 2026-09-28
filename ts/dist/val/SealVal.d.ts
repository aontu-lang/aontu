import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class SealVal extends FeatureVal {
    isSeal: boolean;
    closed: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): "close()" | "open()";
    same(peer: any): boolean;
}
declare function sealCjo(closed: boolean): number;
declare function sealTree(v: any, closed: boolean): void;
declare function unsealTree(v: any): void;
declare function sealBag(v: any, closed: boolean): void;
declare function sealChild(ctx: AontuContext, child: any): Val;
export { SealVal, sealCjo, sealTree, sealBag, sealChild, unsealTree, };
