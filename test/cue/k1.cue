xs: [{name: "web", host: "h1", port: 80}, {name: "db", host: "h2", port: 5432}]
out: [for x in xs {name: x.name, addr: "\(x.host):\(x.port)"}]
