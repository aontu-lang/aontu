import type { ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { Val } from './Val';
import { FeatureVal } from './FeatureVal';
declare abstract class BagVal extends FeatureVal {
    isBag: boolean;
    isGenable: boolean;
    closed: boolean;
    optionalKeys: string[];
    aliasKeys: string[];
    spread: {
        cj: Val | undefined;
    };
    constructor(spec: ValSpec, ctx?: AontuContext);
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    handleExpectedVal(key: string, val: Val, parent: Val, ctx: AontuContext): Val;
    same(peer: any): boolean;
    gen(ctx: AontuContext): any;
}
export { BagVal, };
export declare function sizingResidue(v: any): {
    con: any;
    bag: any;
} | undefined;
