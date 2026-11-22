limit: 2
xs: [{a: 3}, {a: 1}]
out: [for x in xs if x.a > limit {x}]
