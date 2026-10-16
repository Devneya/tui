package launcher

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const Help = `devneya — DSH and Chimney with an embedded application runtime
Usage:
  devneya [--cwd DIRECTORY] [--resume SESSION_ID]
  devneya --version
  devneya --help
  devneya doctor [--json]
  devneya repair

Configure providers with /provider, models with /model, sessions with /resume.
Updates: https://github.com/Devneya/tui/releases
`

type Options struct {
	Command string
	CWD     string
	Resume  string
	JSON    bool
}

func Parse(args []string, cwd string) (Options, error) {
	o := Options{CWD: cwd}
	if len(args) > 0 {
		switch args[0] {
		case "--version", "--help", "repair":
			if len(args) != 1 {
				return o, fmt.Errorf("%s takes no arguments", args[0])
			}
			o.Command = args[0]
			return o, nil
		case "doctor":
			o.Command = "doctor"
			if len(args) == 2 && args[1] == "--json" {
				o.JSON = true
			} else if len(args) != 1 {
				return o, fmt.Errorf("usage: devneya doctor [--json]")
			}
			return o, nil
		}
	}
	seen := map[string]bool{}
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a != "--cwd" && a != "--resume" {
			return o, fmt.Errorf("unknown launcher argument: %s", a)
		}
		if seen[a] {
			return o, fmt.Errorf("duplicate argument: %s", a)
		}
		seen[a] = true
		if i+1 >= len(args) || args[i+1] == "" || args[i+1][0] == '-' {
			return o, fmt.Errorf("%s requires a value", a)
		}
		i++
		if a == "--cwd" {
			o.CWD = args[i]
			if !filepath.IsAbs(o.CWD) {
				o.CWD = filepath.Join(cwd, o.CWD)
			}
		} else {
			o.Resume = args[i]
		}
	}
	return o, nil
}
func Run(args []string, stdout, stderr io.Writer) int {
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(stderr, "devneya:", err)
		return 1
	}
	o, err := Parse(args, cwd)
	if err != nil {
		fmt.Fprintln(stderr, "devneya:", err)
		fmt.Fprint(stderr, Help)
		return 2
	}
	return run(o, stdout, stderr)
}
