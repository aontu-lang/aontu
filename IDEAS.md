
> **Where these sketches went** (marked 2026-08-24; the sketches are
> older). Several landed via the capability review's
> [G8](docs/capability-review/g8-generation.md), decided there
> rather than here: the placeholder `_` ships (`PlaceVal`, in both
> ports), and `each`/`pack`/`filter`/`match` ship as total
> combinators. The pipe `|>` ships too, but data-FIRST
> (`a |> f` is `f(a, ...)`), deliberately deviating from the
> data-last sketch at the bottom of this file. Custom functions
> (`def()`, recursion) were explicitly REFUSED by G8's design —
> termination by construction won. Maths-as-functions and `replace`
> remain unbuilt sketches; G8 pre-registers the arithmetic
> semantics without designing them. The function-over-new-tokens
> principle stated here is cited by the G1 and G4 designs as the
> rule they followed.

# placeholder argument for functions

allows unification peer to be argument
upper(_) & foo -> FOO # same end result as upper(foo)

main use:

x:&:{m:upper(_)} x:a:m:red x:b:m:green -> x:a:m:RED x:b:m:GREEN

also for expressions

x:&:{m:_+2} x:a:m:1 x:b:m:2 -> x:a:m:3 x:b:m:4


implementation:

- needs extenstion to @jsonic/Expr that allows operators to be "standalone"

_ -> PlaceVal

_foo -> prefix-op -> PlusOpVal({peg:[StringVal("_"),StringVal("foo")]})
foo_ -> suffix-op -> PlusOpVal({peg:[StringVal("foo"),StringVal("_")]})
foo_bar -> infix-op -> PlusOpVal({peg:[StringVal(StringVal("foo"),PlusOpVal({peg:[StringVal("_"),StringVal("bar"]})]})


OpVals need to be able to handle placeholder args

OpBaseVal.unify - if placeholder in args, use peer as arg, return function result as unification

how to resolve upper(_) & lower(_) ?
equal ranked placeheld functions cannot unify - above is an error
but allow functions to be ranked (similar to PrefVal) - lowest rank wins

upper(_) & lower(_)  -> nil
rank(2,upper(_)) & lower(_)  -> lower(upper(_)) - lowest rank wins

in general prefer using new functions instead of creating new tokens or syntax!


# maths ops provided by functions

this reserves tokens (/,-,*,%, etc) for other things

add(x,y), mul(x,y), sub(x,y), div(x,y), mod(x,y), rem(x,y)

add === + of course - suggests analogous ops for other types like strings

e.g. mul("a",2) -> "aa", sub("aba","a") -> "b", etc

also ops for booleans!


# replace

replace("abab","b","B") -> "aBaB"
replace("abab","b","B",1) -> "aBab"

replace("aba",regex("[bB]"),"C$1") -> "aCBa" - no new syntax!

extend beyond strings? how?


# custom functions

def("foo","bar",{x:%.0})

foo is a namespace - required for custom functions

foo/bar(1) -> {x:1}

% is the argument list - just a path ref where % is the root (the arg list)

also implies semantics for / operator - qualification of first value

so perhaps {a:1}/{mark:{hide:true}} as the canon for hidden vars? reparseable?

function body is just a new val, however complex

implies need for:
recursion
match(...) for conditionals
each - convert to list
pack - convert to map
filter - filter values in list or map
etc


# piping

say filter({x:number},v) means:
[{x:1},{x:X},{x:2}] -> [{x:1},{x:2}] 
{a:{x:1},b:{x:X},c:{x:2}} -> {a:{x:1},c:{x:2}}
as in each child that can unify with the condition

then

v |> filter({x:number}) means filter({x:number},v)

and in general |> means append left of |> as last arg of right
a|>b|>c -> c(b(a))

a|>b(x)|>c(y) -> c(y,b(x,a))





