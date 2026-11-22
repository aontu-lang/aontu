xs: [{n: "a", env: "prod", tier: "gold"}, {n: "b", env: "dev", tier: "gold"}, {n: "c", env: "dev", tier: "tin"}]
or: [for x in xs if x.env == "prod" || x.tier == "gold" {x.n}]
and: [for x in xs if x.env == "dev" && x.tier == "gold" {x.n}]
not: [for x in xs if x.env != "prod" {x.n}]
