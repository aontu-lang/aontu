import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { JunctionVal } from './JunctionVal';
declare class ConjunctVal extends JunctionVal {
    isConjunct: boolean;
    isGenable: boolean;
    cjo: number;
    constructor(spec: ValSpec, ctx?: AontuContext);
    append(peer: Val): ConjunctVal;
    unify(peer: Val, ctx: AontuContext): Val;
    clone(ctx: AontuContext, spec?: ValSpec): Val;
    getJunctionSymbol(): string;
    gen(ctx?: AontuContext): any;
}
declare function norm(terms: Val[]): Val[];
export { norm, ConjunctVal, };
