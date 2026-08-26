/* Browser stub for node:util. The engine only touches
 * `inspect.custom` (the well-known symbol Val instances register a
 * pretty-printer under), so that is all this provides. */
'use strict'

function inspect(v) {
  try { return JSON.stringify(v) } catch (e) { return String(v) }
}
inspect.custom = Symbol.for('nodejs.util.inspect.custom')

module.exports = { inspect }
