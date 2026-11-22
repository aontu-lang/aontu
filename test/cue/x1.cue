@experiment(try)
a: {x: 1}
try { b: a.x? + 1 }
try { c: a.y? + 1 } else { c: 0 }
