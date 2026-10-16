package main

import (
	"github.com/Devneya/tui/internal/launcher"
	"os"
)

func main() { os.Exit(launcher.Run(os.Args[1:], os.Stdout, os.Stderr)) }
