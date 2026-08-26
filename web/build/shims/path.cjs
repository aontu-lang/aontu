/* Browser stub for node:path — a minimal POSIX-style implementation
 * covering the functions the bundled engine actually calls
 * (join, resolve, dirname, basename, extname, parse, sep,
 * isAbsolute, normalize, relative). */
'use strict'

const sep = '/'

function normalizeParts(parts, allowAboveRoot) {
  const out = []
  for (const part of parts) {
    if ('' === part || '.' === part) continue
    if ('..' === part) {
      if (0 < out.length && '..' !== out[out.length - 1]) out.pop()
      else if (allowAboveRoot) out.push('..')
    }
    else out.push(part)
  }
  return out
}

function isAbsolute(p) {
  return 'string' === typeof p && p.startsWith('/')
}

function normalize(p) {
  p = String(p)
  const abs = isAbsolute(p)
  const trailing = p.endsWith('/') && 1 < p.length
  let out = normalizeParts(p.split('/'), !abs).join('/')
  if ('' === out && !abs) out = '.'
  if ('' !== out && trailing) out += '/'
  return abs ? '/' + out : out
}

function join(...args) {
  const parts = args.filter((a) => null != a && '' !== a).map(String)
  if (0 === parts.length) return '.'
  return normalize(parts.join('/'))
}

function resolve(...args) {
  let resolved = ''
  let abs = false
  for (let i = args.length - 1; 0 <= i && !abs; i--) {
    const p = null == args[i] ? '' : String(args[i])
    if ('' === p) continue
    resolved = p + '/' + resolved
    abs = isAbsolute(p)
  }
  if (!abs) resolved = '/' + resolved // pretend cwd is '/'
  const out = normalizeParts(resolved.split('/'), false).join('/')
  return '/' + out
}

function dirname(p) {
  p = String(p)
  if ('' === p) return '.'
  const abs = isAbsolute(p)
  let end = p.length
  while (1 < end && '/' === p[end - 1]) end--
  const idx = p.lastIndexOf('/', end - 1)
  if (-1 === idx) return abs ? '/' : '.'
  if (0 === idx) return '/'
  return p.slice(0, idx)
}

function basename(p, ext) {
  p = String(p)
  let end = p.length
  while (1 < end && '/' === p[end - 1]) end--
  const idx = p.lastIndexOf('/', end - 1)
  let base = p.slice(idx + 1, end)
  if (ext && base.endsWith(ext) && base !== ext) {
    base = base.slice(0, base.length - ext.length)
  }
  return base
}

function extname(p) {
  const base = basename(p)
  const idx = base.lastIndexOf('.')
  return 0 < idx ? base.slice(idx) : ''
}

function parse(p) {
  p = String(p)
  const root = isAbsolute(p) ? '/' : ''
  const base = basename(p)
  const ext = extname(p)
  const dir = dirname(p)
  return {
    root,
    dir: '.' === dir && !p.startsWith('.') ? '' : dir,
    base,
    ext,
    name: ext ? base.slice(0, base.length - ext.length) : base,
  }
}

function relative(from, to) {
  const f = resolve(from).split('/').filter(Boolean)
  const t = resolve(to).split('/').filter(Boolean)
  let i = 0
  while (i < f.length && i < t.length && f[i] === t[i]) i++
  const up = f.slice(i).map(() => '..')
  return up.concat(t.slice(i)).join('/')
}

module.exports = {
  sep, join, resolve, dirname, basename, extname, parse,
  isAbsolute, normalize, relative,
  posix: null,
}
module.exports.posix = module.exports
