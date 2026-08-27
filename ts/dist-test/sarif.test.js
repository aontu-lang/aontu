"use strict";
/* Copyright (c) 2025 Richard Rodger, MIT License */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// The SARIF renderer (G2 phase 5, ts/src/report-sarif.ts). The shape
// contract is the shared golden in test/spec/files/vet-sarif/, which
// go/report_sarif_test.go holds the Go twin to byte for byte; the
// severity mapping and the no-position branch are pinned here on
// synthetic reports, because no engine path emits them yet (warnings
// are reserved for G3's deprecation mark, info for --surplus).
const node_test_1 = require("node:test");
const Assert = __importStar(require("node:assert"));
const Fs = __importStar(require("node:fs"));
const Path = __importStar(require("node:path"));
const aontu_1 = require("../dist/aontu");
const GOLDEN_DIR = Path.join(__dirname, '..', '..', 'test', 'spec', 'files', 'vet-sarif');
// The redaction the golden's README specifies: message text and
// producer version are the two things deliberately not in cross-port
// parity, so the comparing test removes them from its own output the
// same way test/spec/vet.tsv carves the message out of its goldens.
function redact(sarif) {
    const log = JSON.parse(sarif);
    log.runs[0].tool.driver.version = '<VERSION>';
    for (const result of log.runs[0].results) {
        result.message.text = '<MESSAGE>';
        result.properties.message = '<MESSAGE>';
        // CONDITIONAL, so the golden still records which codes carry a
        // hint and which do not -- that presence IS in parity, only the
        // prose is not.
        if (null != result.properties.hint) {
            result.properties.hint = '<HINT>';
        }
    }
    return (0, aontu_1.exactJSON)(log, 2);
}
(0, node_test_1.describe)('sarif', () => {
    (0, node_test_1.test)('sarif-golden', () => {
        const schema = Fs.readFileSync(Path.join(GOLDEN_DIR, 'schema.aon'), 'utf8');
        const data = Fs.readFileSync(Path.join(GOLDEN_DIR, 'data.aon'), 'utf8');
        // Normalised on read: the golden is compared BYTE FOR BYTE against
        // a generated string that always uses \n, so a CRLF checkout could
        // never match. .gitattributes pins test/spec/files/** to LF, and
        // this is the half that holds when the file did not come from a
        // checkout. The Go twin does the same (go/report_sarif_test.go).
        const expect = Fs.readFileSync(Path.join(GOLDEN_DIR, 'expect.sarif'), 'utf8')
            .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
        const report = (0, aontu_1.vet)(schema, data, {
            schemaUrl: 'schema.aon', dataUrl: 'data.aon',
        });
        Assert.equal(redact((0, aontu_1.sarifReport)(report, 'x')) + '\n', expect);
    });
    // error/warning/info map to SARIF error/warning/note. Only `info`
    // translates, but all three are pinned so a drift in any of them
    // fails here rather than in a consumer.
    (0, node_test_1.test)('sarif-levels', () => {
        const report = {
            verdict: 'invalid',
            truncated: false,
            findings: ['error', 'warning', 'info'].map((severity) => ({
                code: 'x',
                class: 'conflict',
                severity,
                path: '$',
                message: 'm',
                sites: [{ file: 'f', row: 1, col: 1, len: -1, role: 'data' }],
            })),
        };
        const log = JSON.parse((0, aontu_1.sarifReport)(report, 'x'));
        Assert.deepEqual(log.runs[0].results.map((r) => r.level), ['error', 'warning', 'note']);
    });
    // A finding with no position — a parse failure reports at -1:-1 —
    // gets a location with no region rather than an invented one, because
    // SARIF regions are 1-based.
    (0, node_test_1.test)('sarif-no-position-no-region', () => {
        const report = {
            verdict: 'invalid',
            truncated: false,
            findings: [{
                    code: 'syntax',
                    class: 'parse',
                    severity: 'error',
                    path: '$',
                    message: 'm',
                    sites: [{ file: 'data.aon', row: -1, col: -1, len: -1, role: 'data' }],
                }],
        };
        const log = JSON.parse((0, aontu_1.sarifReport)(report, 'x'));
        const physical = log.runs[0].results[0].locations[0].physicalLocation;
        Assert.equal(physical.artifactLocation.uri, 'data.aon');
        Assert.equal(physical.region, undefined);
        Assert.equal(log.runs[0].results[0].relatedLocations, undefined);
    });
    // A clean run is still a report: one run, empty results, the tool
    // named — what a CI upload of a passing check looks like. A FAILED
    // run (verdict error: the schema was unusable) also has empty
    // results, and the difference is carried in SARIF's own invocation
    // metadata so a consumer never mistakes "could not check" for
    // "checked and clean".
    (0, node_test_1.test)('sarif-empty', () => {
        const report = { verdict: 'valid', truncated: false, findings: [] };
        const log = JSON.parse((0, aontu_1.sarifReport)(report, '1.2.3'));
        Assert.equal(log.version, '2.1.0');
        Assert.deepEqual(log.runs[0].results, []);
        Assert.equal(log.runs[0].tool.driver.name, 'aontu');
        Assert.equal(log.runs[0].tool.driver.version, '1.2.3');
        Assert.equal(log.runs[0].invocations[0].executionSuccessful, true);
        const failed = { verdict: 'error', truncated: false, findings: [] };
        const flog = JSON.parse((0, aontu_1.sarifReport)(failed, '1.2.3'));
        Assert.deepEqual(flog.runs[0].results, []);
        Assert.equal(flog.runs[0].invocations[0].executionSuccessful, false);
    });
    // A site's file is a filesystem path; the SARIF uri percent-encodes
    // every URI-significant byte (by UTF-8 byte, so the Go twin's loop
    // produces identical text) — otherwise text after `#` reads as a
    // fragment and the consumer loses the file association.
    (0, node_test_1.test)('sarif-uri-encoding', () => {
        const report = {
            verdict: 'invalid',
            truncated: false,
            findings: [{
                    code: 'x',
                    class: 'conflict',
                    severity: 'error',
                    path: '$',
                    message: 'm',
                    sites: [{ file: 'a b#c%.aon', row: 1, col: 1, len: -1, role: 'data' }],
                }],
        };
        const log = JSON.parse((0, aontu_1.sarifReport)(report, 'x'));
        Assert.equal(log.runs[0].results[0].locations[0].physicalLocation
            .artifactLocation.uri, 'a%20b%23c%25.aon');
    });
});
//# sourceMappingURL=sarif.test.js.map