import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class AbsentVal extends FeatureVal {
    isAbsent: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    same(peer: Val): boolean;
    get canon(): string;
    gen(_ctx?: AontuContext): undefined;
}
export { AbsentVal, };
