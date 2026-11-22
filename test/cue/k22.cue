env: "prod"
out: {name: "web", if env == "prod" {replicas: 3, tier: "gold"}}
