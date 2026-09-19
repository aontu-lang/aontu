"use strict";
/* Copyright (c) 2021-2025 Richard Rodger, MIT License */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Site = void 0;
// row, col and len -1, url and src empty, mean UNKNOWN: a value the
// engine minted rather than read has no site, and must not be edited
// as though it had one.
class Site {
    constructor(val) {
        const site = (val?.site ?? val);
        this.row = site?.row ?? -1;
        this.col = site?.col ?? -1;
        this.url = site?.url ?? '';
        this.len = site?.len ?? -1;
        this.src = site?.src ?? '';
        this.via = site?.via;
    }
} /* node:coverage ignore next 10 */
exports.Site = Site;
//# sourceMappingURL=site.js.map