xs: [{name: "a", team: "core"}, {name: "b", team: "web"}, {name: "c", team: "core"}]
out: {for x in xs {(x.team): [for y in xs if y.team == x.team {y.name}]}}
