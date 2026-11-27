import type { TrustOptions } from './type';
type Position = {
    line: number;
    character: number;
};
type Range = {
    start: Position;
    end: Position;
};
type CursorOn = 'key' | 'value' | 'ref';
type CursorPath = {
    on: CursorOn;
    path: string[];
    range: Range;
    reads?: string[];
};
type PathSite = {
    canon: string;
    file: string;
    range: Range;
    role: string;
};
type PathValue = {
    canon: string;
    kind: string;
    titles: string[];
    descriptions: string[];
};
type CursorValue = PathValue & {
    path: string[];
    range: Range;
};
type PathPlace = {
    file: string;
    range: Range;
};
type Member = {
    key: string;
    canon: string;
    optional: boolean;
};
type CursorMembers = {
    on: 'key' | 'path';
    path: string[];
    members: Member[];
};
type CursorOptions = {
    trust?: TrustOptions;
};
type DocSymbol = {
    name: string;
    kind: number;
    range: Range;
    selectionRange: Range;
    children: DocSymbol[];
};
type Hit = {
    on: CursorOn;
    path: string[];
    start: number;
    end: number;
    reads?: string[];
};
declare function keySpan(src: string, at: number, seg: string): [number, number] | undefined;
declare function hitsOf(src: string, root: any): {
    keys: Hit[];
    values: Hit[];
};
declare function pathAt(src: string, pos: Position, opts?: CursorOptions): CursorPath | undefined;
declare function describeVal(val: any): PathValue;
declare function describeAt(src: string, pos: Position, opts?: CursorOptions): CursorValue | undefined;
declare function definitionAt(src: string, pos: Position, opts?: CursorOptions): PathPlace[] | undefined;
declare function mapAt(src: string, root: any, off: number): {
    val: any;
    path: string[];
} | undefined;
declare function membersAt(src: string, pos: Position, opts?: CursorOptions): CursorMembers | undefined;
declare function symbolsOf(src: string, opts?: CursorOptions): DocSymbol[] | undefined;
declare function symbolTree(src: string, root: any): DocSymbol[];
declare function sitesOf(src: string, path: string[], opts?: CursorOptions): PathSite[] | undefined;
export { pathAt, sitesOf, keySpan, hitsOf, describeAt, definitionAt, describeVal, membersAt, mapAt, symbolsOf, symbolTree, };
export type { CursorMembers, CursorPath, CursorOn, CursorOptions, CursorValue, DocSymbol, Member, PathPlace, PathSite, PathValue, Position, Range, };
