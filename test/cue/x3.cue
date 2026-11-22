@experiment(functions)
_add: func(a: int, b: int = 10) -> int: a + b
x: _add(1)
y: _add(1, 2)
