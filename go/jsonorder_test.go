/* Copyright (c) 2026 Richard Rodger, MIT License */

package aontu

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

func TestReportJSONTagsAreLexicographic(t *testing.T) {
	types := []any{
		TraceEntry{},
		WhyConjunct{}, WhySite{},
		VetFinding{}, VetSite{}, ViewLoss{},
	}

	for _, v := range types {
		rt := reflect.TypeOf(v)
		var tags []string
		for i := 0; i < rt.NumField(); i++ {
			tag := rt.Field(i).Tag.Get("json")
			if "" == tag || "-" == tag {
				continue
			}
			tags = append(tags, strings.Split(tag, ",")[0])
		}
		want := append([]string(nil), tags...)
		sort.Strings(want)
		if !reflect.DeepEqual(tags, want) {
			t.Errorf("%s: json tags are not lexicographic\n got:  %v\n want: %v",
				rt.Name(), tags, want)
		}
	}
}
