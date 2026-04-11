package response

import "testing"

func TestSuccessNormalizesTopLevelNilSlice(t *testing.T) {
	var items []string

	envelope := Success(items)

	normalized, ok := envelope.Data.([]string)
	if !ok {
		t.Fatalf("expected []string, got %T", envelope.Data)
	}

	if normalized == nil {
		t.Fatal("expected non-nil slice")
	}

	if len(normalized) != 0 {
		t.Fatalf("expected empty slice, got len=%d", len(normalized))
	}
}

func TestSuccessKeepsNonSliceData(t *testing.T) {
	envelope := Success("ok")

	value, ok := envelope.Data.(string)
	if !ok {
		t.Fatalf("expected string, got %T", envelope.Data)
	}

	if value != "ok" {
		t.Fatalf("unexpected value %q", value)
	}
}
