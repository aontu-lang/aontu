import type { AontuOptions, TrustOptions, Val } from './type';
type IncludeOptions = {
    trust?: TrustOptions;
    textExt?: string[];
};
declare function includeOpts(options: IncludeOptions): Partial<AontuOptions>;
declare function propagateMarks(source: Val, target: Val): void;
declare function collectDeprecations(root: Val): Array<{
    val: Val;
    path: string[];
}>;
declare function walkBagVals(root: Val, fn: (v: Val, path: string[]) => void): void;
declare function deprecationMessage(d: Record<string, string>): string;
declare function canonRiders(v: Val): string;
declare function formatPath(path: Val | string[], absolute?: boolean): string;
type WalkApply = (key: string | number | undefined, val: Val, parent: Val | undefined, path: (string | number)[]) => Val;
/**
 * Walk a Val structure depth first, applying functions before and after descending.
 * Only traverses Val instances - stops at non-Val children.
 */
declare function walk(val: Val, before?: WalkApply, after?: WalkApply, maxdepth?: number | null, key?: string | number, parent?: Val, path?: (string | number)[]): Val;
declare function explainOpen(ctx: any, t: any[] | undefined | null | false, note: string, ac?: Val, bc?: Val): any[] | null;
declare function ec(t: any[] | undefined | null, why: string): (string | null)[] | undefined;
declare function explainClose(t: any[] | undefined | null, out?: Val): void;
declare function formatExplain(t: any[], d?: number): string;
declare function items(o: any): any[][];
export type { IncludeOptions };
export { includeOpts, items, propagateMarks, canonRiders, collectDeprecations, walkBagVals, deprecationMessage, formatPath, walk, WalkApply, explainOpen, ec, explainClose, formatExplain, };
