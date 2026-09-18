import type { Val } from './type';
declare function aliasErrors(ctx: any, root: Val): void;
declare function expandAliases(root: Val, snapmap: Map<string, Val>): void;
export { aliasErrors, expandAliases, };
