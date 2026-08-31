type ArgMode = 'value' | 'capture' | 'template' | 'trial' | 'projector' | 'text';
type GroupSig = {
    mode: ArgMode;
    type: string;
};
type ArgSig = {
    name: string;
    mode: ArgMode;
    type: string;
    opt?: boolean;
    rest?: boolean;
    group?: GroupSig[];
};
type FuncSig = {
    name: string;
    args: ArgSig[];
    out: string;
};
declare function parseSigLine(line: string): FuncSig;
declare function renderSigArg(a: ArgSig): string;
declare function renderSig(sig: FuncSig): string;
declare function parseSigText(text: string): Record<string, FuncSig>;
export type { ArgMode, ArgSig, GroupSig, FuncSig, };
declare const funcSig: Record<string, FuncSig>;
export { funcSig, parseSigLine, parseSigText, renderSig, renderSigArg, };
