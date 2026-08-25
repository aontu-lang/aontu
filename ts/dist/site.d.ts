import type { Val } from './type';
type SiteSpec = {
    row?: number;
    col?: number;
    url?: string;
    len?: number;
    src?: string;
};
declare class Site {
    row: number;
    col: number;
    url: string;
    len: number;
    src: string;
    constructor(val?: Val | SiteSpec);
}
export { Site, };
