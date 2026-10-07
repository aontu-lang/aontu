import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { BagVal } from './BagVal';
declare function meetSpreads(ctx: AontuContext, a: Val, b: Val, why: string): Val;
declare function spreadSnapKey(cj: any): string;
declare class MapVal extends BagVal {
    isMap: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    aliasDeclarationsAreRooted(ctx: AontuContext): Val | undefined;
    unify(peer: Val, ctx: AontuContext): Val;
    spreadClone(ctx: AontuContext): Val;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    get canon(): string;
    inspection(d?: number): string;
}
export { MapVal, meetSpreads, spreadSnapKey, };
