# The published JSON Schema meta-schemas, vendored

The meta-schemas of the five dialects the importer reads, as
json-schema.org serves them at their own URIs, copied byte for byte on
2026-10-09. `make metaschemas` stages them into
`ts/src/metaschemas.ts` and `go/metaschemas/`, where the importer reads
each at the URI its own identifier gives, so a schema reaches them
without `--doc`; both suites assert each copy is identical with these
files.

| File | URI | SHA-256 |
|---|---|---|
| `draft-04/schema.json` | <http://json-schema.org/draft-04/schema> | `e1489d0b4755f02793302591d3fcb8f07b6893a82a94f24895f8e4edf11b82e2` |
| `draft-06/schema.json` | <http://json-schema.org/draft-06/schema> | `0064e880ba214bff1cee511e678fbe48c9826dd359e91e2423fc36de67b2ebe1` |
| `draft-07/schema.json` | <http://json-schema.org/draft-07/schema> | `692e1d165e47afcb5f11b2ce1c639635ffa834035d6ecb6bcf3087481dae8404` |
| `draft/2019-09/meta/applicator.json` | <https://json-schema.org/draft/2019-09/meta/applicator> | `6b5f4e2fbc326d63cef6f6a3fa53bbfd3da39323116bc2eee866d716afc0e52c` |
| `draft/2019-09/meta/content.json` | <https://json-schema.org/draft/2019-09/meta/content> | `9054737ada8e2ffbd9c9487ea406a86af8b57dcfd269543f04aba782936e3385` |
| `draft/2019-09/meta/core.json` | <https://json-schema.org/draft/2019-09/meta/core> | `a6751523406d9ca767032ae97eb1c00c2de6d3cac9fc7d619babb460131cc1cb` |
| `draft/2019-09/meta/format.json` | <https://json-schema.org/draft/2019-09/meta/format> | `a53cf235aab26c7639e70e94656136b20bcc364379c6a129cc06377982f91e96` |
| `draft/2019-09/meta/meta-data.json` | <https://json-schema.org/draft/2019-09/meta/meta-data> | `ebcce1cded976590c75b4e5ee18ac471ffd8d21575a41d3ba05f59946fcbb5ce` |
| `draft/2019-09/meta/validation.json` | <https://json-schema.org/draft/2019-09/meta/validation> | `c83c5121d0afd313846002429cd16b08ab77be022f423c70f0cfb64adc1069b7` |
| `draft/2019-09/schema.json` | <https://json-schema.org/draft/2019-09/schema> | `7b761b3e121f0a0ca1ea2a0b8e2cc856bcf801604b8268d71bacaa202bc0c13b` |
| `draft/2020-12/meta/applicator.json` | <https://json-schema.org/draft/2020-12/meta/applicator> | `bf273b26f9f735b93ece78f2b61b36676e1d122ce78ab37ad5a2e45dfa1ca2b1` |
| `draft/2020-12/meta/content.json` | <https://json-schema.org/draft/2020-12/meta/content> | `a10456605b2b5bb12a1b4dcfc0300f02f54d3e8bb3646bed7724583866627682` |
| `draft/2020-12/meta/core.json` | <https://json-schema.org/draft/2020-12/meta/core> | `21f79d143fab1f180245c331e5657057045b36794d41fe151e6e4fed65035299` |
| `draft/2020-12/meta/format-annotation.json` | <https://json-schema.org/draft/2020-12/meta/format-annotation> | `5c79404f831dd905c0f40fefac7c6f3e51bf3729b4a876a5c2020178d97f3bcc` |
| `draft/2020-12/meta/format-assertion.json` | <https://json-schema.org/draft/2020-12/meta/format-assertion> | `6a5a8e13c605e3eff51f9bf8da18078880d81ff1634e391760ccc2e16ee2146f` |
| `draft/2020-12/meta/meta-data.json` | <https://json-schema.org/draft/2020-12/meta/meta-data> | `c664d438a84d58889c8edecd248ce2f945a4bc0e3b087323b11303dc136abfbe` |
| `draft/2020-12/meta/unevaluated.json` | <https://json-schema.org/draft/2020-12/meta/unevaluated> | `fc99f32188da41689a9382af174dd42e8b255e4374965c157b8286556b4ab2bc` |
| `draft/2020-12/meta/validation.json` | <https://json-schema.org/draft/2020-12/meta/validation> | `e921c5b79264d3689af01c1af1ffdf692e09f1c45df90a0f08eb7288c9acdeab` |
| `draft/2020-12/schema.json` | <https://json-schema.org/draft/2020-12/schema> | `41da76f5afb7ce062d248f762463a92f7ca47e4e0f905b224ba6afeef91ded0f` |

`LICENSE` is the licence of
[json-schema-spec](https://github.com/json-schema-org/json-schema-spec)
at commit `4f56a9900674b27804f0ec32e3b7fdfa4efad695`, unchanged. The
JSON Schema Specification Authors offer the meta-schemas under the
BSD 3-Clause licence or the Academic Free License 3.0, and aontu takes
the BSD 3-Clause licence.

The 2019-09 and 2020-12 vocabulary meta-schemas json-schema.org serves
differ from the copies json-schema-spec tags `draft-handrews-json-schema-02`
and `draft-bhutton-json-schema-01` in one respect: a served copy
declares no `$vocabulary` of its own, where a tagged copy declares its
vocabulary. The 2019-09 and 2020-12 dialect meta-schemas are the same
in both. aontu takes the served copies, since they are what each
identifier reaches.
