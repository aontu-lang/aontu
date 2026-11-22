svc: {a: {port: 1}, b: {port: 2}}
ports: [for _, v in svc {v.port}]
