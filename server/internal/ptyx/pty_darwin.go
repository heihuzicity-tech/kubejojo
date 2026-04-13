//go:build darwin

package ptyx

import (
	"os"
	"syscall"
	"unsafe"

	"golang.org/x/sys/unix"
)

func open() (*os.File, *os.File, error) {
	ptmx, err := os.OpenFile("/dev/ptmx", os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		return nil, nil, err
	}

	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, ptmx.Fd(), uintptr(unix.TIOCPTYGRANT), 0); errno != 0 {
		_ = ptmx.Close()
		return nil, nil, errno
	}

	if _, _, errno := syscall.Syscall(syscall.SYS_IOCTL, ptmx.Fd(), uintptr(unix.TIOCPTYUNLK), 0); errno != 0 {
		_ = ptmx.Close()
		return nil, nil, errno
	}

	nameBuffer := make([]byte, 128)
	if _, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		ptmx.Fd(),
		uintptr(unix.TIOCPTYGNAME),
		uintptr(unsafe.Pointer(&nameBuffer[0])),
	); errno != 0 {
		_ = ptmx.Close()
		return nil, nil, errno
	}

	nameLength := 0
	for nameLength < len(nameBuffer) && nameBuffer[nameLength] != 0 {
		nameLength++
	}

	tty, err := os.OpenFile(string(nameBuffer[:nameLength]), os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		_ = ptmx.Close()
		return nil, nil, err
	}

	return ptmx, tty, nil
}
