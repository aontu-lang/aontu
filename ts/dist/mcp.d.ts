import type { TrustOptions } from './type';
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
    }>;
    required: string[];
    run: (args: any, trust: TrustOptions) => any;
};
export declare function toolList(): any[];
export declare function callTool(name: string, args: any, tools?: ToolDef[]): any;
export declare function handle(msg: McpRequest, version: string): McpResponse | undefined;
export declare function parseError(): McpResponse;
