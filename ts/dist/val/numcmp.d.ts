type Scaled = {
    inf?: 1 | -1;
    unscaled: bigint;
    scale: number;
};
declare function scaledOfFloat(f: number): Scaled;
declare function scaledOfNumeric(v: any): Scaled;
declare function cmpScaled(a: Scaled, b: Scaled): number;
declare function cmpNumeric(a: any, b: any): number;
declare function scaledOfShown(v: any): Scaled;
declare function scaledIsMultiple(p: Scaled, d: Scaled): boolean;
declare function cmpCodePoints(a: string, b: string): number;
declare function towerRank(v: any): number;
declare function scaledIsIntegral(s: Scaled): boolean;
declare function scaledFloor(s: Scaled): bigint;
export { Scaled, scaledOfFloat, scaledOfNumeric, cmpScaled, cmpNumeric, cmpCodePoints, towerRank, scaledIsIntegral, scaledFloor, scaledOfShown, scaledIsMultiple, };
