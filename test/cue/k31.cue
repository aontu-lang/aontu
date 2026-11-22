import "list"
n: 3
out: [for i in list.Range(0, n, 1) {"node-\(i)"}]
