/* Injected globals for the browser bundle: a minimal `process` (the
 * pkg include-resolver calls process.cwd() when probing node_modules
 * paths) and a minimal `Buffer.from(text, 'utf8')` (report-sarif
 * measures UTF-8 byte lengths with it). Injected by esbuild, so free
 * references to `process` / `Buffer` in the bundled CJS resolve here
 * without touching a real Node runtime. */

const proc = {
  cwd: () => '/',
  env: {},
  platform: 'browser',
  argv: [],
  versions: {},
}

function bufferFrom(data, _encoding) {
  if ('string' === typeof data) return new TextEncoder().encode(data)
  if (data instanceof Uint8Array) return data
  return new TextEncoder().encode(String(data))
}

const buf = {
  from: bufferFrom,
  isBuffer: (b) => b instanceof Uint8Array,
}

export { proc as process, buf as Buffer }
