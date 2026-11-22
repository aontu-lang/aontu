svcs: [{name: "web", ports: [80, 443]}, {name: "db", ports: [5432]}]
out: [for s in svcs for p in s.ports {p}]
