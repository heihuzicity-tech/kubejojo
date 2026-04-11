package response

import "reflect"

type Envelope struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func Success(data any) Envelope {
	return Envelope{
		Code:    "OK",
		Message: "success",
		Data:    normalizeData(data),
	}
}

func Failure(code string, message string) Envelope {
	return Envelope{
		Code:    code,
		Message: message,
	}
}

func normalizeData(data any) any {
	if data == nil {
		return nil
	}

	value := reflect.ValueOf(data)
	if value.Kind() == reflect.Slice && value.IsNil() {
		return reflect.MakeSlice(value.Type(), 0, 0).Interface()
	}

	return data
}
