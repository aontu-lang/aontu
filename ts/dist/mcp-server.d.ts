export type ServerArgs = {
    root?: string;
    help?: boolean;
    err?: string;
};
export declare function parseArgs(argv: string[]): ServerArgs;
declare class LineCodec {
    private write;
    private onExit;
    private version;
    private root?;
    private buffer;
    constructor(write: (line: string) => void, onExit: (code: number) => void, version: string, root?: string | undefined);
    push(chunk: string | Buffer): void;
    end(): void;
    private line;
    private send;
}
declare function main(stdin?: NodeJS.ReadableStream, write?: (line: string) => void, exit?: (code: number) => void, version?: string, argv?: string[], errwrite?: (line: string) => void): LineCodec | undefined;
export { LineCodec, main, };
