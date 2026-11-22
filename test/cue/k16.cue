xs: [{ns: "a", name: "web", port: 80}, {ns: "b", name: "web", port: 81}]
out: {for x in xs {"\(x.ns)/\(x.name)": x.port}}
