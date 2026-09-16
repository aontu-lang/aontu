// Run with: node --test test/system/rb-solar/doc/guides.test.mjs
// Execute the published recipes in a disposable example, never the working app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, cpSync, mkdtempSync, mkdirSync, symlinkSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const docs = dirname(fileURLToPath(import.meta.url));
const example = resolve(docs, '..');
const engine = resolve(example, '../../..');
const pages = ['model', 'rails-code', 'erd', 'change-and-check'];
const read = (name) => readFileSync(join(docs, `${name}.md`), 'utf8');
const blocks = (name, lang) => [...read(name).matchAll(new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```', 'g'))].map((m) => m[1]);
function block(name, lang, includes) {
  const found = blocks(name, lang).filter((body) => body.includes(includes));
  assert.equal(found.length, 1, `${name}: expected one block containing ${includes}`);
  return found[0];
}

test('quoted source stays identical to the generator or model', () => {
  let checked = 0;
  for (const page of pages) {
    for (const m of read(page).matchAll(/<!-- source: ([^ ]+) -->\n```[^\n]*\n([\s\S]*?)\n```/g)) {
      assert.ok(readFileSync(resolve(docs, m[1]), 'utf8').includes(m[2]), `${page}: ${m[1]} excerpt drifted`);
      checked++;
    }
  }
  assert.ok(checked >= 8, 'source excerpt checks must cover the guides');
});

test('the published generation and field-change recipes produce the stated output', (t) => {
  // Exit 3 is `tools/cmptree-check.js` saying the generator runtime is not
  // installed. Skip as check.sh does rather than fail: the recipes that
  // write bytes cannot run without it.
  if (3 === spawnSync('node', [join(engine, 'tools/cmptree-check.js'), '--folder', '.'],
    { input: '{}', encoding: 'utf8' }).status) {
    return t.skip('the recipes need a generator runtime');
  }
  const root = mkdtempSync(join(tmpdir(), 'aontu-guide-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const work = join(root, 'test/system/rb-solar');
  mkdirSync(work, { recursive: true });
  mkdirSync(join(root, 'ts/bin'), { recursive: true });
  symlinkSync(join(engine, 'ts/bin/aontu.js'), join(root, 'ts/bin/aontu.js'));
  // The recipes reach the seam by RELATIVE path, as a reader does, so the
  // disposable example needs it where the published command looks.
  symlinkSync(join(engine, 'tools'), join(root, 'tools'));
  for (const name of ['gen', 'doc', 'ref', 'model.aon']) {
    cpSync(join(example, name), join(work, name), { recursive: true });
  }
  const setup = block('model', 'sh', 'aontu()');
  function shell(command, status = 0) {
    const result = spawnSync('bash', ['-eu', '-o', 'pipefail', '-c', `${setup}\n${command}`], { cwd: work, encoding: 'utf8' });
    assert.equal(result.status, status, `${command}\n${result.stdout}\n${result.stderr}`);
    return result.stdout;
  }
  function recipe(page, includes, status = 0) {
    return shell(block(page, 'sh', includes), status);
  }
  recipe('model', "aontu view doc");
  // `get out` answers the TREE, so the route is a Line's `src` with its
  // quotes escaped; match the part that survives JSON.
  assert.match(recipe('rails-code', 'get out work/routes.aon'), /planets#index/);
  recipe('rails-code', '--out app');
  // The bytes are the runtime's, so the recipe that WRITES is what proves
  // them: print the tree, write it, compare the file with the golden.
  const erdTree = recipe('erd', 'template --marker');
  recipe('erd', '--out doc');
  assert.equal(readFileSync(join(work, 'doc/erd.mmd'), 'utf8'),
    readFileSync(join(example, 'doc/erd.mmd'), 'utf8'));
  recipe('erd', 'aontu view');

  // The prose explicitly calls out this redundant wrapper. Hold that claim.
  const template = join(work, 'gen/erd.mmd');
  const source = readFileSync(template, 'utf8');
  writeFileSync(template, source.replace('each(.field, _ & { mark:"" })', '.field'));
  assert.equal(recipe('erd', 'template --marker'), erdTree);
  writeFileSync(template, source);

  appendFileSync(join(work, 'model.aon'), '\n' + block('change-and-check', 'aontu', 'nickname') + '\n');
  recipe('change-and-check', '--folder doc', 1);
  recipe('change-and-check', 'for generator');
  recipe('change-and-check', 'for format');
  // The full check also boots Rails and resets its development database;
  // this recipe test only runs the formatter line from that fence.
  shell(block('change-and-check', 'sh', 'fmt --write').split('\n')[0]);
  shell('aontu fmt --check model.aon');
  for (const name of ['routes', 'migrate', 'seeds', 'model', 'api_base', 'api_controller', 'ui_controller']) {
    shell(`aontu template gen/${name}.rb > work/${name}.aon && aontu model get out work/${name}.aon | node ../../../tools/cmptree-check.js --folder app`);
  }
  shell(`aontu model get out gen/views.aon | node ../../../tools/cmptree-check.js --folder app`);
  recipe('change-and-check', '--folder doc');
  for (const name of [
    'app/db/migrate/20260101000000_create_planets.rb',
    'app/app/controllers/api/planets_controller.rb',
    'app/app/views/planets/index.html.erb',
    'app/app/views/planets/show.html.erb',
    'doc/erd.mmd',
  ]) assert.match(readFileSync(join(work, name), 'utf8'), /nickname/, name);
  assert.equal(readFileSync(join(work, 'app/app/models/planet.rb'), 'utf8'), readFileSync(join(example, 'app/app/models/planet.rb'), 'utf8'));
  assert.match(readFileSync(join(work, 'doc/erd.mmd'), 'utf8'), /string nickname/);
});
