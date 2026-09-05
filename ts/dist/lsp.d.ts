import type { Val } from './type';
import type { WhyConjunct } from './provenance';
declare const SEVERITY_ERROR = 1;
declare const SEVERITY_WARNING = 2;
declare const SEVERITY_INFORMATION = 3;
declare const SEVERITY_HINT = 4;
declare const LSP_VERSION = "0.57.0";
type Position = {
    line: number;
    character: number;
};
type Range = {
    start: Position;
    end: Position;
};
type Diagnostic = {
    range: Range;
    severity: number;
    code?: string;
    source: string;
    message: string;
    tags?: number[];
};
type Message = {
    jsonrpc?: string;
    id?: number | string | null;
    method?: string;
    params?: any;
};
type OutMessage = {
    jsonrpc: string;
    id?: number | string | null;
    method?: string;
    params?: any;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
};
declare function computeDiagnostics(src: string, opts?: {
    vars?: Record<string, Val>;
    trust?: any;
    textExt?: string[];
}): Diagnostic[];
type MarkupContent = {
    kind: 'markdown' | 'plaintext';
    value: string;
};
type Hover = {
    contents: MarkupContent;
    range?: Range;
};
export declare function contributionsMarkdown(conjuncts: WhyConjunct[]): string;
declare function computeHover(src: string, position: Position, provenance?: boolean, trust?: any): Hover | null;
type CompletionItem = {
    label: string;
    kind?: number;
    detail?: string;
};
declare const COMPLETION_FUNCTION = 3;
declare const COMPLETION_KEYWORD = 14;
declare const BUILTIN_FUNCS: string[];
declare function computeCompletions(): CompletionItem[];
export declare function uriToPath(uri: unknown): string | undefined;
declare class LspHandler {
    private docs;
    private shutdownOK;
    private exited;
    private trust;
    private provenance;
    get shouldExit(): boolean;
    get exitCode(): number;
    doc(uri: string): string | undefined;
    handle(msg: Message): OutMessage[];
    private publish;
}
export { computeDiagnostics, computeHover, computeCompletions, LspHandler, LSP_VERSION, BUILTIN_FUNCS, SEVERITY_ERROR, SEVERITY_WARNING, SEVERITY_INFORMATION, SEVERITY_HINT, COMPLETION_FUNCTION, COMPLETION_KEYWORD, };
export type { Position, Range, Diagnostic, Message, OutMessage, Hover, MarkupContent, CompletionItem, };
