//go:build linux || darwin

package launcher

import (
	"os"
	"syscall"
)

func startNode(node string, args, env []string, cwd string) (int, error) {
	if err := os.Chdir(cwd); err != nil {
		return 1, err
	}
	return 1, syscall.Exec(node, append([]string{node}, args...), env)
}
