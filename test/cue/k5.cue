xs: [{a: 3, b: 1}, {a: 1, b: 2}]
out: [for x in xs if x.a > x.b {x.a}]
