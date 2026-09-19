import type { Val } from './type';
declare function aliasErrors(ctx: any, root: Val): void;
declare function aliasBudget(ctx: any, root: Val): Val | undefined;
declare function expandAliases(root: Val, snapmap: Map<string, Val>): void;
export { aliasBudget, aliasErrors, expandAliases, };
