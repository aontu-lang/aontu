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
declare function hasPlace(v: Val): boolean;
declare function fillPlace(v: Val, fill: Val, ctx: AontuContext): Val;
declare function rebuild(v: Val, peg: any, ctx: AontuContext): Val;
export { boundArgStart, rebuild, hasPlace, fillPlace, PlaceVal, };
