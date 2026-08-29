import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { Site } from '../site';
import { JunctionVal } from '../val/JunctionVal';
declare class DisjunctVal extends JunctionVal {
    isDisjunct: boolean;
    isGenable: boolean;
    cjo: number;
    prefsRanked: boolean;
    constructor(spec: {
        peg: Val[];
    }, ctx?: AontuContext, _sites?: Site[]);
    append(peer: Val): DisjunctVal;
    unify(peer: Val, ctx: AontuContext): Val;
    rankPrefs(ctx: AontuContext): Val | undefined;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    getJunctionSymbol(): string;
    gen(ctx: AontuContext): any;
}
export { DisjunctVal, };
