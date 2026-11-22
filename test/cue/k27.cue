import "list"
lines: [{qty: 2, price: 5}, {qty: 1, price: 7}]
out: list.Sum([for l in lines {l.qty * l.price}])
