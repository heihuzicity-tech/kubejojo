package jsonx

import "encoding/json"

// Slice guarantees that nil slices are encoded as [] instead of null.
type Slice[T any] []T

func (s Slice[T]) MarshalJSON() ([]byte, error) {
	if s == nil {
		return []byte("[]"), nil
	}

	return json.Marshal([]T(s))
}
