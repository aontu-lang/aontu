svc: {a: {port: 1}, b: {port: 2}}
ports: {for k, v in svc {(k): v.port}}
