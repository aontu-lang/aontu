import type { Val, ValSpec } from '../type';
import { AontuContext } from '../ctx';
import { ScalarVal } from './ScalarVal';
import { ScalarKindVal } from './ScalarKindVal';
export type Address = {
    absolute: boolean;
    up: number;
    parts: string[];
};
export declare function parseAddress(s: string): Address | undefined;
export declare function textAddress(s: string): string;
export declare function prefixMeet(a: string, b: string): string | undefined;
declare class PathVal extends ScalarVal {
    isPath: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    unify(peer: Val, ctx: AontuContext): Val;
    get canon(): string;
    superior(): Val;
}
declare class PathKindVal extends ScalarKindVal {
    isPathKind: boolean;
    constructor(spec: ValSpec, ctx?: AontuContext);
    get canon(): string;
}
export { PathVal, PathKindVal, };
