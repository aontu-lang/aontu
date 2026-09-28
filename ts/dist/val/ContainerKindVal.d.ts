import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { FeatureVal } from './FeatureVal';
declare class MapKindVal extends FeatureVal {
    isContainerKind: boolean;
    isMapKind: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    same(peer: any): boolean;
}
declare class ListKindVal extends FeatureVal {
    isContainerKind: boolean;
    isListKind: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    same(peer: any): boolean;
}
export { MapKindVal, ListKindVal, };
