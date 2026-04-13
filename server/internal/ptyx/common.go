package ptyx

import (
	"os"
	"os/exec"
	"syscall"

	"golang.org/x/sys/unix"
)

type Winsize struct {
	Rows uint16
	Cols uint16
	X    uint16
	Y    uint16
}

func StartWithSize(cmd *exec.Cmd, size *Winsize) (*os.File, error) {
	ptmx, tty, err := open()
	if err != nil {
		return nil, err
	}

	if size != nil {
		if err := Setsize(ptmx, size); err != nil {
			_ = ptmx.Close()
			_ = tty.Close()
			return nil, err
		}
	}

	cmd.Stdin = tty
	cmd.Stdout = tty
	cmd.Stderr = tty
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
		Ctty:    0,
	}

	if err := cmd.Start(); err != nil {
		_ = ptmx.Close()
		_ = tty.Close()
		return nil, err
	}

	_ = tty.Close()
	return ptmx, nil
}

func Setsize(file *os.File, size *Winsize) error {
	return unix.IoctlSetWinsize(int(file.Fd()), unix.TIOCSWINSZ, &unix.Winsize{
		Row:    size.Rows,
		Col:    size.Cols,
		Xpixel: size.X,
		Ypixel: size.Y,
	})
}
