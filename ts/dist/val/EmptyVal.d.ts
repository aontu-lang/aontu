import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class EmptyVal extends FeatureVal {
    isEmptyConstraint: boolean;
    cjo: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    same(peer: any): boolean;
}
export { EmptyVal, };
