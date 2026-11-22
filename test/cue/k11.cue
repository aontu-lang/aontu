xs: [{name: "web", port: 80}, {name: "db", port: 5432}]
out: {for x in xs {(x.name): x}}
