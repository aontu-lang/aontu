teams: {core: {email: "core@x", tier: 1}, web: {email: "web@x", tier: 2}}
svc: {a: {team: "core"}, b: {team: "web"}, c: {team: "core"}}
out: {for k, s in svc {(k): teams[s.team].email}}
