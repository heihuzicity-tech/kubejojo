package jsonx

import "testing"

func TestSliceMarshalJSONNil(t *testing.T) {
	var items Slice[string]

	data, err := items.MarshalJSON()
	if err != nil {
		t.Fatalf("marshal nil slice: %v", err)
	}

	if string(data) != "[]" {
		t.Fatalf("expected [], got %s", string(data))
	}
}

func TestSliceMarshalJSONNonNil(t *testing.T) {
	items := Slice[string]{"a", "b"}

	data, err := items.MarshalJSON()
	if err != nil {
		t.Fatalf("marshal non-nil slice: %v", err)
	}

	if string(data) != "[\"a\",\"b\"]" {
		t.Fatalf("unexpected json: %s", string(data))
	}
}
