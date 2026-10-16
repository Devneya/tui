package launcher

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/Devneya/tui/internal/payload"
)

func Environment(root, dir string, m Metadata, source []string) []string {
	values := map[string]string{}
	for _, entry := range source {
		if k, v, ok := strings.Cut(entry, "="); ok {
			if runtime.GOOS == "windows" {
				k = strings.ToUpper(k)
			}
			values[k] = v
		}
	}
	for _, k := range []string{"NODE_PATH", "NODE_OPTIONS", "DSH_PERMISSION_MODE", "DSH_TUI_STANDALONE", "DSH_TUI_STANDALONE_CACHE", "DSH_TUI_HOST_ENTRY", "DSH_TUI_DISABLE_HOST_ENTRY"} {
		delete(values, k)
	}
	temp := filepath.Join(root, "cache", "tmp")
	managed := map[string]string{
		"NODE_ENV": "production", "DEVNEYA_HOME": root, "DEVNEYA_RUNTIME": dir, "DEVNEYA_BUILD_ID": m.BuildID, "DEVNEYA_MANAGED_BUILD": "1",
		"DSH_HOME": filepath.Join(root, "data"), "DEVNEYA_TUI_HOME": filepath.Join(root, "tui"), "DSH_TUI_BACKEND": "dsh", "DSH_TUI_SESSION_ROOT": filepath.Join(root, "data", "sessions"),
		"NODE_COMPILE_CACHE": filepath.Join(root, "cache", "node", m.BuildID), "TMPDIR": temp, "TMP": temp, "TEMP": temp,
		"PATH": filepath.Join(dir, "bin") + string(os.PathListSeparator) + values["PATH"],
	}
	for k, v := range managed {
		values[k] = v
	}
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	env := make([]string, 0, len(keys))
	for _, k := range keys {
		env = append(env, k+"="+values[k])
	}
	return env
}

type Check struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail,omitempty"`
}
type Doctor struct {
	SchemaVersion        int      `json:"schemaVersion"`
	Product              string   `json:"product"`
	Version              string   `json:"version"`
	BuildID              string   `json:"buildId"`
	Target               string   `json:"target"`
	ApplicationRoot      string   `json:"applicationRoot"`
	RuntimeRoot          string   `json:"runtimeRoot"`
	NodeVersion          string   `json:"nodeVersion"`
	DSHVersion           string   `json:"dshVersion"`
	TUIVersion           string   `json:"tuiVersion"`
	Checks               []Check  `json:"checks"`
	MissingExternalTools []string `json:"missingExternalTools"`
}

func run(o Options, stdout, stderr io.Writer) int {
	in := payload.Embedded()
	m, err := ReadMetadata(in)
	if err != nil {
		fmt.Fprintln(stderr, "devneya:", err)
		return 1
	}
	if o.Command == "--help" {
		fmt.Fprint(stdout, Help)
		return 0
	}
	if o.Command == "--version" {
		target := m.Target
		if target == "development" {
			target = runtime.GOOS + "-" + runtime.GOARCH + " (development)"
		}
		fmt.Fprintf(stdout, "devneya %s\nNode %s · DSH %s (prerelease) · Chimney %s\nTarget %s · build %s\n", m.Version, m.NodeVersion, m.DSHVersion, m.TUIVersion, target, m.BuildID)
		return 0
	}
	if len(in.Archive) == 0 {
		fmt.Fprintln(stderr, "devneya: this development build has no embedded runtime; build a release payload before launching")
		return 1
	}
	root, err := OwnedRoot()
	if err != nil {
		fmt.Fprintln(stderr, "devneya:", err)
		return 1
	}
	dir, err := EnsureRuntime(root, in.Archive, m, o.Command == "repair")
	if err != nil {
		fmt.Fprintln(stderr, "devneya:", err)
		return 1
	}
	if o.Command == "repair" {
		fmt.Fprintln(stdout, "Runtime repaired. Settings and sessions preserved.")
		return 0
	}
	node := filepath.Join(dir, "bin", "node")
	if runtime.GOOS == "windows" {
		node += ".exe"
	}
	env := Environment(root, dir, m, os.Environ())
	if o.Command == "doctor" {
		return doctor(o, stdout, stderr, node, root, dir, env, m)
	}
	st, err := os.Stat(o.CWD)
	if err != nil || !st.IsDir() {
		fmt.Fprintln(stderr, "devneya: workspace must be an accessible directory:", o.CWD)
		return 1
	}
	args := []string{filepath.Join(dir, "app", "entry.mjs")}
	if o.Resume != "" {
		args = append(args, "--resume", o.Resume)
	}
	code, err := startNode(node, args, env, o.CWD)
	if err != nil {
		fmt.Fprintln(stderr, "devneya: cannot launch bundled Node:", err)
		return 1
	}
	return code
}
func doctor(o Options, stdout, stderr io.Writer, node, root, dir string, env []string, m Metadata) int {
	d := Doctor{SchemaVersion: 1, Product: m.Product, Version: m.Version, BuildID: m.BuildID, Target: m.Target, ApplicationRoot: root, RuntimeRoot: dir, NodeVersion: m.NodeVersion, DSHVersion: m.DSHVersion, TUIVersion: m.TUIVersion, Checks: []Check{{Name: "payload", OK: true}}, MissingExternalTools: []string{}}
	tools := []string{"git", "rg"}
	if runtime.GOOS == "windows" {
		tools = append(tools, "pwsh")
	} else {
		tools = append(tools, "bash")
	}
	for _, tool := range tools {
		if _, e := exec.LookPath(tool); e != nil {
			d.MissingExternalTools = append(d.MissingExternalTools, tool)
		}
	}
	ctx, cancel := doctorContext(60 * time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, node, filepath.Join(dir, "app", "entry.mjs"), "--devneya-doctor")
	cmd.Env = env
	cmd.Dir = dir
	output, e := cmd.Output()
	var checks []Check
	if e != nil {
		d.Checks = append(d.Checks, Check{Name: "runtime-imports", OK: false, Detail: "Bundled runtime diagnostic failed; no credentials are included in this report."})
	} else if json.Unmarshal(output, &checks) != nil {
		d.Checks = append(d.Checks, Check{Name: "runtime-imports", OK: false, Detail: "Invalid diagnostic response"})
	} else {
		d.Checks = append(d.Checks, checks...)
	}
	code := 0
	for _, c := range d.Checks {
		if !c.OK {
			code = 1
		}
	}
	if o.JSON {
		enc := json.NewEncoder(stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(d); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
	} else {
		fmt.Fprintf(stdout, "devneya %s · %s · build %s\nApplication root: %s\nRuntime: %s\n", m.Version, m.Target, m.BuildID, root, dir)
		for _, c := range d.Checks {
			result := "OK"
			if !c.OK {
				result = "FAIL"
			}
			fmt.Fprintf(stdout, "%s %s %s\n", result, c.Name, c.Detail)
		}
		if len(d.MissingExternalTools) > 0 {
			fmt.Fprintln(stdout, "Missing external tools:", strings.Join(d.MissingExternalTools, ", "))
		}
	}
	return code
}
