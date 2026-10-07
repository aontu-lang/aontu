import type { Val } from './type';
type AliasBinding = {
    name: string;
    row: number;
    col: number;
    decl: string;
    from: string;
};
declare function aliasScope(src: string): AliasBinding[];
declare function aliasErrors(ctx: any, root: Val): void;
declare function aliasBudget(ctx: any, root: Val): Val | undefined;
declare function expandAliases(root: Val, snapmap: Map<string, Val>): void;
declare function spelledCanon(v: Val): string;
export { aliasBudget, aliasErrors, aliasScope, expandAliases, spelledCanon, };
export type { AliasBinding, };
