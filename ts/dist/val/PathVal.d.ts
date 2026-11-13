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
export declare function addressPath(addr: Address, at: (string | number)[]): string[] | undefined;
export declare function textAddress(s: string): string;
export declare function joinFlows(a: [string, Val][] | undefined, b: [string, Val][] | undefined): [string, Val][] | undefined;
export declare function joinRelates(a: Val[] | undefined, b: Val[] | undefined): Val[] | undefined;
export declare function relateText(v: Val): string;
export declare function prefixMeet(a: string, b: string): string | undefined;
export declare function linkAt(ctx: AontuContext, addrsrc: string, at: string[], flows: [string, Val][] | undefined, relates: Val[], relroot: boolean): PathVal | undefined;
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
