//go:build linux || darwin

package launcher

import "os"

func restrictDirectory(path string) error { return os.Chmod(path, 0700) }
