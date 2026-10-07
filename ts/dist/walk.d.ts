export declare function restArgs(r: any): any[];
export declare function walkVals(v: any, visit: (v: any) => boolean, seen: Set<any>): void;
export declare function collectNils(root: any, seen: Set<any>): any[];
