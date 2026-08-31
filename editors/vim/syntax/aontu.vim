" Aontu syntax highlighting.
if exists('b:current_syntax')
  finish
endif

syn keyword aontuType     string number float integer boolean top nil
syn keyword aontuConstant true false null
syn keyword aontuFunction upper lower copy key pref super type hide move path close open map list

syn match  aontuComment  "#.*$"
syn region aontuString   start=+"+ skip=+\\"+ end=+"+
syn match  aontuNumber   "\<-\=\d\+\(\.\d\+\)\=\>"
syn match  aontuRef      "\$[A-Za-z0-9_.]*\|\.[A-Za-z0-9_.]\+"
syn match  aontuOperator "[&|*+]"

hi def link aontuType     Type
hi def link aontuConstant Constant
hi def link aontuFunction Function
hi def link aontuComment  Comment
hi def link aontuString   String
hi def link aontuNumber   Number
hi def link aontuRef      Identifier
hi def link aontuOperator Operator

let b:current_syntax = 'aontu'
