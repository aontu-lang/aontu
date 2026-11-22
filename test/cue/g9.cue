names: ["web", "auth"]
deploy: {for n in names {(n): image: "acme/\(n)"}}
