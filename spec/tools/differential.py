"""Run the definition's rows through both aontu CLIs and compare verdicts.

Reads the five-column `verdict` rows the oracle writes
(test/spec/def-fragment.tsv), batches the instances of each schema into
one document per port, so a schema that alone refuses (verdict `error`)
stops only its own run, and writes every case the ports answer
differently from the definition to <workdir>/disagreements.tsv, one row
per case, for spec/ledger.tsv.

Usage: python3 -I differential.py <def-rows.tsv> <workdir> <go-cli> <ts-cli-js>
"""
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter, OrderedDict
from concurrent.futures import ThreadPoolExecutor

rows_path, work, go_cli, ts_js = sys.argv[1:5]
os.makedirs(work, exist_ok=True)
ports = {"go": [go_cli], "ts": ["node", ts_js]}
KEY = "v: "

groups = OrderedDict()
with open(rows_path) as f:
    for line in f:
        if line.startswith("#") or not line.strip():
            continue
        name, mode, schema, data, expect = line.rstrip("\n").split("\t")
        assert mode == "verdict" and schema.startswith(KEY) and data.startswith(KEY), name
        want = json.loads(expect)["verdict"]
        verdict = "admit" if want == "valid" else "refuse"
        groups.setdefault(schema[len(KEY):], []).append((name, data[len(KEY):], verdict))


def run(item):
    n, (src, rows) = item
    doc = os.path.join(work, f"v{n}.aontu")
    dat = os.path.join(work, f"v{n}.data.aontu")
    with open(doc, "w") as f:
        f.writelines(f"d{i}: {src}\n" for i in range(len(rows)))
    with open(dat, "w") as f:
        f.write("{" + ", ".join(f'"d{i}": {data}' for i, (_, data, _) in enumerate(rows)) + "}")
    result = {}
    for port, cmd in ports.items():
        out = subprocess.run(cmd + ["vet", "--max-errors", "100000", "--format", "json", doc, dat],
                             capture_output=True, text=True)
        report = json.loads(out.stdout)
        if report["verdict"] == "error":
            codes = sorted({f["code"] for f in report["findings"]})
            result[port] = (["error"] * len(rows), codes)
            continue
        refused = set()
        for f in report["findings"]:
            m = re.match(r"^\$\.d(\d+)(\.|$)", f["path"])
            refused.add(int(m.group(1)))
        result[port] = (["refuse" if i in refused else "admit" for i in range(len(rows))], [])
    return src, rows, result


items = list(enumerate(groups.items()))
results, start = [], time.time()
with ThreadPoolExecutor(max_workers=8) as pool:
    for k, r in enumerate(pool.map(run, items), 1):
        results.append(r)
        if k % 60 == 0 or k == len(items):
            print(f"values {k}/{len(items)} ({k * 100 // len(items)}%), {time.time() - start:.0f}s", flush=True)

total = sum(len(rows) for _, rows, _ in results)
agree = Counter()
parity = 0
errors = Counter()
disagree = Counter()
examples = {}
with open(os.path.join(work, "disagreements.tsv"), "w") as ledger:
    ledger.write("# name\tsrc\tinstance\tdefinition\tgo\tts\n")
    for src, rows, res in results:
        for i, (cid, data, verdict) in enumerate(rows):
            g, t = res["go"][0][i], res["ts"][0][i]
            parity += g == t
            for p, a in (("go", g), ("ts", t)):
                agree[p] += (a == "admit") == (verdict == "admit")
            if g == "error":
                errors[tuple(res["go"][1])] += 1
            if (g == "admit") != (verdict == "admit") or (t == "admit") != (verdict == "admit"):
                key = (verdict, g, t)
                disagree[key] += 1
                examples.setdefault(key, []).append((src, data))
                ledger.write(f"{cid}\t{src}\t{data}\t{verdict}\t{g}\t{t}\n")

print()
for p in ports:
    print(f"{p}: {agree[p]}/{total} agree with the definition on admit/refuse")
print(f"go vs ts: {parity}/{total} identical")
print(f"cases whose schema alone refused (verdict error): {sum(errors.values())}, codes {dict(errors)}")
print()
for key, count in disagree.most_common():
    print(f"definition={key[0]} go={key[1]} ts={key[2]}: {count} cases")
    for src, data in examples[key][:14]:
        print(f"    {src:58}  {data}")
