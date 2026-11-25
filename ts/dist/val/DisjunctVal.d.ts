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
    readArms(peer: Val, ctx: AontuContext): boolean;
    rankPrefs(ctx: AontuContext): Val | undefined;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    getJunctionSymbol(): string;
    gen(ctx: AontuContext): any;
}
declare function meetRanked(ctx: AontuContext, a: Val, b: Val): Val;
export { DisjunctVal, meetRanked, };
