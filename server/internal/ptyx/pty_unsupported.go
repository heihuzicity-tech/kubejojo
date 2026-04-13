//go:build !linux && !darwin

package ptyx

import (
	"fmt"
	"os"
)

func open() (*os.File, *os.File, error) {
	return nil, nil, fmt.Errorf("pty is not supported on this platform")
}
