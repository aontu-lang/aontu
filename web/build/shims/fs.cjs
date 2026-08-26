/* Browser stub for node:fs. The playground has no filesystem, so
 * @"file" includes (and anything else that reads disk) fail with a
 * clear message instead of a confusing missing-builtin error. */
'use strict'

function noFs(what) {
  const err = new Error(
    'no filesystem in the playground: ' + what +
    ' is unavailable in the browser (file includes like @"other.aon" ' +
    'need the Node or Go CLI)')
  err.code = 'ENOENT'
  return err
}

module.exports = {
  existsSync: () => false,
  readFileSync: (p) => { throw noFs('reading ' + JSON.stringify(String(p))) },
  statSync: (p) => { throw noFs('stat of ' + JSON.stringify(String(p))) },
  realpathSync: (p) => String(p),
  promises: {},
}
