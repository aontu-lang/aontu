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
type CursorRefs = {
    path: string[];
    writes: PathPlace[];
    reads: PathPlace[];
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
declare function readsOf(src: string, root: any, path: string[], texts: Record<string, string>): PathPlace[];
declare function referencesAt(src: string, pos: Position, opts?: CursorOptions): CursorRefs | undefined;
declare function sitesOf(src: string, path: string[], opts?: CursorOptions): PathSite[] | undefined;
type FileEdit = {
    file: string;
    range: Range;
    newText: string;
};
type CursorRename = {
    path: string[];
    range: Range;
    placeholder: string;
    edits?: FileEdit[];
} | {
    refused: string;
};
type RenameOptions = CursorOptions & {
    root?: string;
    prepare?: boolean;
};
type Entry = {
    v: any;
    path: string[];
    calls: any[];
    arg: boolean;
    step: boolean;
    kid: number;
};
declare function renameEntries(root: any): Entry[];
declare function fileRefusal(file: string, root: string | undefined, readable: boolean): string | undefined;
declare function fileText(file: string, mem?: Record<string, string>): string | undefined;
declare function renameAt(src: string, pos: Position, name: string, opts?: RenameOptions): CursorRename | undefined;
type DocEdit = {
    range: Range;
    newText: string;
};
type CursorAction = {
    title: string;
    path: string[];
    edits: DocEdit[];
};
declare function entryDeletion(src: string, s: number, e: number): [number, number];
declare function actionsAt(src: string, range: Range, opts?: CursorOptions): CursorAction[] | undefined;
export { pathAt, sitesOf, keySpan, hitsOf, describeAt, definitionAt, describeVal, membersAt, mapAt, symbolsOf, symbolTree, referencesAt, readsOf, renameAt, renameEntries, fileRefusal, actionsAt, entryDeletion, fileText, };
export type { CursorAction, CursorMembers, CursorPath, CursorOn, CursorOptions, CursorRefs, CursorRename, CursorValue, DocEdit, DocSymbol, FileEdit, Member, RenameOptions, PathPlace, PathSite, PathValue, Position, Range, };
