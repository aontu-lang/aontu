import type { Val } from '../type';
import { AontuContext } from '../ctx';
export declare function fillDiff(generated: any, data: any, val: any, path?: string[], out?: string[][]): string[][];
export declare function sameJson(a: any, b: any): boolean;
export declare function withoutOptionalFills(generated: any, data: any): any;
export declare function admitsJson(met: any, out: any, own: any): boolean;
export declare function ownJson(value: Val, ctx: AontuContext): any;
export declare function admitsSettled(ctx: AontuContext, trial: Val, value: Val, own: any, path: string[]): boolean | undefined;
