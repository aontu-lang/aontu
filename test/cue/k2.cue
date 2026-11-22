xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]
out: [for x in xs if x.port > 1000 {x.name}]
