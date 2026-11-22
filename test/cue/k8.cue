as: ["a", "b"]
bs: ["x", "y"]
out: [for a in as for b in bs {"\(a)-\(b)"}]
