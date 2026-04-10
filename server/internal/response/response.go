package response

type Envelope struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func Success(data any) Envelope {
	return Envelope{
		Code:    "OK",
		Message: "success",
		Data:    data,
	}
}

func Failure(code string, message string) Envelope {
	return Envelope{
		Code:    code,
		Message: message,
	}
}
