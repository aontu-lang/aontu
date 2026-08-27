import type { TrustOptions } from './type';
import type { VetFinding } from './vet';
export declare const MCP_PROTOCOL = "2024-11-05";
export type McpRequest = {
    id?: number | string | null;
    jsonrpc?: string;
    method?: string;
    params?: any;
};
export type McpResponse = {
    error?: {
        code: number;
        message: string;
    };
    id: number | string | null;
    jsonrpc: '2.0';
    result?: any;
};
export type ToolDef = {
    name: string;
    description: string;
    properties: Record<string, {
        type: string;
        description: string;
        items?: any;
    }>;
    required: string[];
    docs?: string[];
    check?: (a: any) => string | undefined;
    refuse?: (a: any, finding: VetFinding, trust: TrustOptions, paths: Record<string, string>) => any;
    run: (a: any, trust: TrustOptions, paths: Record<string, string>) => any;
};
export declare function servedTrust(root?: string): TrustOptions;
export declare function confinedParseFailure(src: string, trust: TrustOptions, path?: string): VetFinding | undefined;
export declare function toolList(root?: string): any[];
export declare function callTool(name: string, args: any, opts?: {
    root?: string;
    tools?: ToolDef[];
}): any;
export declare function serverInstructions(root?: string): string;
export declare function handle(msg: McpRequest, version: string, root?: string): McpResponse | undefined;
export declare function parseError(): McpResponse;
