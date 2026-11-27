---
description: Carry bytes through a JSON document as base64, base64url or hex text with `encode` and `decode`, and bound the numbers of a binary record with the sized names of `aontu:num`.
group: schemas
order: 65
---

# Carry binary data

JSON has no bytes, and neither does aontu: binary data crosses as text
in a named encoding. `encode(s, name)` writes a string's UTF-8 bytes
in one, and `decode(t, name)` reads the string back. The numbers of a
binary record are the other half, and `@"aontu:num"` has a name for
each size.

## Encode a string's bytes

`base64` is padded with `=`, `base64url` has no padding, and `hex` is
two lowercase digits per byte. Write this as `secret.aontu`:

<!-- test: scenario carry-binary -->
<!-- test: file secret.aontu -->
```aontu
password: "pa55:wörd"

wire: basic: encode($.password, base64)
wire: url: encode($.password, base64url)
wire: hex: encode($.password, hex)
```

<!-- test: run -->
```sh
$ aontu secret.aontu
{
  "password": "pa55:wörd",
  "wire": {
    "basic": "cGE1NTp3w7ZyZA==",
    "hex": "706135353a77c3b67264",
    "url": "cGE1NTp3w7ZyZA"
  }
}
```

The `ö` is two bytes in UTF-8, so it is `c3b6` in the hex and `w7Z`
in both base64 spellings.

## Decode text from your data

`decode` reads exactly what `encode` writes, with one allowance: hex is
read in either case. Write this as `read.aontu`:

<!-- test: file read.aontu -->
```aontu
token: "eyJ1c2VyIjoiYW5uIn0"
claims: decode($.token, base64url)
upper: decode("6B6579", hex)
```

<!-- test: run -->
```sh
$ aontu read.aontu
{
  "claims": "{\"user\":\"ann\"}",
  "token": "eyJ1c2VyIjoiYW5uIn0",
  "upper": "key"
}
```

Any other spelling of the same bytes is refused, so text from a source
that pads its base64url, or wraps its base64 in lines, has to be
normalised before aontu reads it. Write this as `padded.aontu`:

<!-- test: file padded.aontu -->
```aontu
token: decode("eyJ1c2VyIjoiYW5uIn0=", base64url)
```

<!-- test: run -->
```sh
$ aontu padded.aontu
[aontu/decode_malformed]: Cannot resolve value at path $.token
...
$ echo $?
1
```

## Keep raw bytes encoded

A string holds characters, so `decode` refuses bytes that are not
UTF-8: a key, an image or a hash has no string to decode to. Carry it
in its encoded form from the source to the output, and check the text
you can check, its alphabet. Write this as `key.aontu`:

<!-- test: file key.aontu -->
```aontu
key: string & re("^[A-Za-z0-9+/]*={0,2}$")
key: "/wA="
```

<!-- test: run -->
```sh
$ aontu key.aontu
{
  "key": "/wA="
}
```

`decode("/wA=", base64)` would be refused here: its two bytes, `ff`
and `00`, are not UTF-8.

## Bound the numbers of a binary record

A header, a packet or a file record holds fixed-width numbers, and
`@"aontu:num"` names each width under `$.aontu.Num`: `Int8` to
`Int128`, `Uint8` to `Uint128`, and `Float32`. Write this as
`header.aontu`:

<!-- test: file header.aontu -->
```aontu
@"aontu:num"

Header: type({
  version: $.aontu.Num.Uint8
  length: $.aontu.Num.Uint32
  checksum: $.aontu.Num.Uint64
  offset: $.aontu.Num.Int16
})

frame: $.Header & {
  version: 2
  length: 4096
  checksum: 0d18446744073709551615
  offset: -12
}
```

<!-- test: run -->
```sh
$ aontu header.aontu
{
  "aontu": {
    "Num": {}
  },
  "frame": {
    "checksum": 18446744073709551615,
    "length": 4096,
    "offset": -12,
    "version": 2
  }
}
```

A 64-bit value past 2^53 is written as a `0d` literal, which keeps
every digit. A value past a width is refused at its field. Write this
as `wide.aontu`:

<!-- test: file wide.aontu -->
```aontu
@"aontu:num"

frame: version: $.aontu.Num.Uint8 & 256
```

<!-- test: run -->
```sh
$ aontu wide.aontu
[aontu/constraint]: Cannot unify values at path $.frame.version
...
$ echo $?
1
```

To build names of your own on the bundled ones, such as a port that
is a `Uint16` above zero, see [name a reusable
constraint](name-a-reusable-constraint.md). Every name and bound is
listed in [the `aontu:num` sized
numbers](../reference-language.md#the-aontunum-sized-numbers), and the
encodings in [Encodings: `encode` and
`decode`](../reference-language.md#encodings-encode-and-decode).
