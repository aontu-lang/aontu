/* Copyright (c) 2026 Richard Rodger, MIT License */

// The Unicode Character Database files the generators read
// (ts/scripts/formatgen.cjs, ts/scripts/unicodegen.cjs), at one pinned
// version: fetched once into a cache ($AONTU_UCD, or the system's
// temporary directory) and held to their recorded hashes, so a moved
// file or an error page fails the run rather than its output. The
// release before it is pinned too, for the files the property tables
// read: the vendored test262 property escapes were generated from it
// (test/vectors/test262/README.md).

'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const VERSION = '18.0.0'
const FILES = {
  'UnicodeData.txt': ['ucd/UnicodeData.txt', '0736451de439ae7baf1425136617da495e09ee5afbe6e394374db7009ea08950'],
  'Scripts.txt': ['ucd/Scripts.txt', '0071fd81b6aeae25f6e8bce8efec3066a6476a91b49bdb2f52dc76e817862a6a'],
  'ScriptExtensions.txt': ['ucd/ScriptExtensions.txt', '5c9d34a922f687726f2a8bcf57d49f905987e51f1b21b58c95a00fbe255cec23'],
  'PropList.txt': ['ucd/PropList.txt', 'f438f532e8737bb8a2702126cdf9c4af5e357c58c7acf9d9eb2fc7c1a1d955d6'],
  'PropertyAliases.txt': ['ucd/PropertyAliases.txt', '83b8df695f9da543dba02b0be2b8bd72f0b52836ad264be113c6d285021ef025'],
  'PropertyValueAliases.txt': ['ucd/PropertyValueAliases.txt', '06c4c8eaf7b0bf34abe73b113da1215bd784ac254d4c223600b90267caa4bbbd'],
  'DerivedCoreProperties.txt': ['ucd/DerivedCoreProperties.txt', '09c928886a178fcafd93c29e4bd59073a058e5a100b716d425cb563ab50f68c9'],
  'HangulSyllableType.txt': ['ucd/HangulSyllableType.txt', '0468ce5e735a6e3f0e9d12ec006410e86cedc515c34706704c756808a6cf740e'],
  'DerivedNormalizationProps.txt': ['ucd/DerivedNormalizationProps.txt', '98ac7f67d985fe781e317f6182e885e94cabb0c314769e6dd73e48b226931ccd'],
  'DerivedJoiningType.txt': ['ucd/extracted/DerivedJoiningType.txt', 'e2408ff2c92b175b0f7bf62c989bbb54c7b077528fe31f8d69b96fa09e7d61ed'],
  'DerivedGeneralCategory.txt': ['ucd/extracted/DerivedGeneralCategory.txt', 'd6b151d2d40ee9b1876d26f417980f45ffae47b6055ccf7203cb31f07a030f94'],
  'DerivedBinaryProperties.txt': ['ucd/extracted/DerivedBinaryProperties.txt', 'f4336d325727d94c31f06b660488f5213a5b6f6cf8bb55b090f87bac704805a5'],
  'emoji-data.txt': ['ucd/emoji/emoji-data.txt', '80d00f8e616a0ef27fd6b8de3b758c06383b5d917e2977709578e68baf733bf1'],
  'IdnaMappingTable.txt': ['idna/IdnaMappingTable.txt', 'a03b1eb38032268c696406a83f0972d6a815acd2c8d4151d42ec0fda70ffced1'],
}

const PRIOR = '17.0.0'
const PRIOR_FILES = {
  'Scripts.txt': ['ucd/Scripts.txt', '9f5e50d3abaee7d6ce09480f325c706f485ae3240912527e651954d2d6b035bf'],
  'ScriptExtensions.txt': ['ucd/ScriptExtensions.txt', 'ec2107e58825a1586acee8e0911ce18260394ac8b87e535ca325f1ccbeb06bc6'],
  'PropList.txt': ['ucd/PropList.txt', '130dcddcaadaf071008bdfce1e7743e04fdfbc910886f017d9f9ac931d8c64dd'],
  'PropertyAliases.txt': ['ucd/PropertyAliases.txt', '4441f573caf952ffece1d7c892e7715bd7136dfc26f96eb6f268bf1e474715fb'],
  'PropertyValueAliases.txt': ['ucd/PropertyValueAliases.txt', '64e9a5f76f7a1e8b5a47d6a1f9a26522a251208f5276bdfa1559dac7cf2e827a'],
  'DerivedCoreProperties.txt': ['ucd/DerivedCoreProperties.txt', '24c7fed1195c482faaefd5c1e7eb821c5ee1fb6de07ecdbaa64b56a99da22c08'],
  'DerivedNormalizationProps.txt': ['ucd/DerivedNormalizationProps.txt', '71fd6a206a2c0cdd41feb6b7f656aa31091db45e9cedc926985d718397f9e488'],
  'DerivedGeneralCategory.txt': ['ucd/extracted/DerivedGeneralCategory.txt', 'd62e5bab70ca74f099343f71224fa051cb1fdd61a1ab45c0488c44cfc0b6102e'],
  'DerivedBinaryProperties.txt': ['ucd/extracted/DerivedBinaryProperties.txt', '13dd09d35a9377e33eb388a01e6581d4bfec6b2685316078c341982fa444071a'],
  'emoji-data.txt': ['ucd/emoji/emoji-data.txt', '2cb2bb9455cda83e8481541ecf5b6dfda66a3bb89efa3fa7c5297eccf607b72b'],
}

function get(url) {
  return new Promise((done, fail) => https.get(url, (res) => {
    if (200 !== res.statusCode) {
      return fail(new Error(url + ': ' + res.statusCode))
    }
    const parts = []
    res.on('data', (d) => parts.push(d)).on('end', () => done(Buffer.concat(parts))).on('error', fail)
  }).on('error', fail))
}

async function fetchUcd(version = VERSION) {
  const prior = PRIOR === version
  const dir = (prior ? process.env.AONTU_UCD_PRIOR : process.env.AONTU_UCD) ??
    path.join(os.tmpdir(), 'aontu-ucd-' + version)
  fs.mkdirSync(dir, { recursive: true })
  for (const [name, [rel, sha]] of Object.entries(prior ? PRIOR_FILES : FILES)) {
    const at = path.join(dir, name)
    if (!fs.existsSync(at)) {
      fs.writeFileSync(at, await get('https://www.unicode.org/Public/' + version + '/' + rel))
    }
    const got = crypto.createHash('sha256').update(fs.readFileSync(at)).digest('hex')
    if (got !== sha) {
      throw new Error(name + ' is not the pinned Unicode ' + version + ' file: ' + got)
    }
  }
  return dir
}

function lines(dir, f) {
  return fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
    .map((l) => l.replace(/#.*/, '').trim()).filter((l) => '' !== l)
}

function span(s) {
  const [a, b] = s.trim().split('..')
  return [parseInt(a, 16), parseInt(b ?? a, 16)]
}

module.exports = { VERSION, PRIOR, fetchUcd, lines, span }
