xs: [{a: 1}, {a: 2}, {a: 3}]
out: [for x in xs let y = x.a * 2 if y > 2 {v: y}]
