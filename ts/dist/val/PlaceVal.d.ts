import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { Val as ValBase } from './Val';
declare class PlaceVal extends ValBase {
    isPlace: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, _ctx: AontuContext): Val;
    get canon(): string;
    superior(): Val;
}
declare function boundArgStart(v: any): number;
declare function unboundHole(ctx: AontuContext, root: Val): Val | undefined;
declare function hasPlace(v: any): boolean;
declare function waitsOnHole(v: any): boolean;
declare function fillPlace(v: Val, fill: Val, ctx: AontuContext): Val;
declare function rebuild(v: Val, peg: any, ctx: AontuContext): Val;
export { boundArgStart, hasPlace, rebuild, unboundHole, waitsOnHole, fillPlace, PlaceVal, };
