# aontu by example

The ladder: start with the JSON you already know, add one thing at a
time. Every rung is a valid document.

## 1. It is JSON

```
{"service": {"name": "auth", "port": 8080}}
```

Bare keys and no commas also parse, so this is the same document:

```
service: {
  name: "auth"
  port: 8080
}
```

## 2. Say what a value MAY be

```
service: {
  name: string
  port: integer
}
```

Nothing generates yet — this is a truth, not a value. `aontu vet
service.aon deploy.aon` says whether a deployment satisfies it.

## 3. Say what it SHOULD be

```
service: {
  name: string
  port: *8080 | integer      # 8080 unless told otherwise
  replicas: *1 | integer
}
```

Now it generates: `{"service":{"name":…,"port":8080,"replicas":1}}` —
except `name`, which nothing has supplied. Defaults are picked at
generation; they do not stop a caller from choosing something else.

`*8080 | integer` means what it reads as: a caller's `9090` overrides
it, and a caller's `1.5` is refused, because the branch admits only the
kind it names. Write `*8080 | number` if any numeric value should be
allowed to win.

## 4. Say it once, for every key

```
services: {
  &: { port: integer, replicas: *1 | integer }
  auth: { port: 8080 }
  db:   { port: 5432, replicas: 3 }
}
```

The `&:` template meets EVERY key. `aontu why $.services.db.replicas`
reports both contributions — the template's `*1|integer` and the
literal `3` — with the line each was written on.

## 5. Bound it

```
services: {
  &: {
    port: integer & min(1) & max(65535)
    name: string & re("^[a-z][a-z0-9-]*$")
  }
}
```

A port of `0` is now an error with a path, not a runtime surprise.

## 6. Layer it

```
# base.aon
service: { image: string, replicas: *1 | integer }

# prod.aon
@"base.aon"
service: { image: "auth:v2.3", replicas: 5 }
```

Unification is order-independent: `base & prod` is `prod & base`. To
change a value without editing the file, append to an overlay:

```
aontu set '$.service.replicas=7' --entry prod.aon --overlay local.aon
```

If the value is PINNED rather than open, that command refuses and
names the pinning site — which is the honest answer, and where
`aontu why` takes you next.
