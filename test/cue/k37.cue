xs: [{name: "web"}, {name: "db"}]
out: [for x in xs {n: x.name}]
