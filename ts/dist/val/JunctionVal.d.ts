import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare abstract class JunctionVal extends FeatureVal {
    isJunction: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    append(peer: Val): JunctionVal;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get canon(): string;
    abstract getJunctionSymbol(): string;
}
export { JunctionVal, };
