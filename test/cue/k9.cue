import "list"
allowed: ["web", "cache"]
xs: [{name: "web"}, {name: "db"}, {name: "cache"}]
out: [for x in xs if list.Contains(allowed, x.name) {x.name}]
