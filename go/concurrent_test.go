/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"sync"
	"testing"
)

func TestNewConcurrent(t *testing.T) {
	const n = 16
	var wg sync.WaitGroup
	errs := make([]error, n)
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func(i int) {
			defer wg.Done()
			v, err := New().Unify("a:1 b:$.a")
			if err != nil {
				errs[i] = err
				return
			}
			if got := v.Canon(); got != `{"a":1,"b":1}` {
				t.Errorf("goroutine %d: got %s", i, got)
			}
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Errorf("goroutine %d: %v", i, err)
		}
	}
}
