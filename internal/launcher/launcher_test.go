package launcher

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/Devneya/tui/internal/payload"
)

func fixture(t *testing.T) ([]byte, Metadata) {
	t.Helper()
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	files := map[string]File{}
	for name, body := range map[string]string{"bin/node": "bundled node fixture", "app/entry.mjs": "fixture entry"} {
		h := &zip.FileHeader{Name: name, Method: zip.Deflate}
		h.SetMode(0644)
		w, e := z.CreateHeader(h)
		if e != nil {
			t.Fatal(e)
		}
		w.Write([]byte(body))
		files[name] = File{Size: int64(len(body)), SHA256: digest([]byte(body)), Mode: 0644}
	}
	if e := z.Close(); e != nil {
		t.Fatal(e)
	}
	return b.Bytes(), Metadata{BuildID: strings.Repeat("a", 20), FullIdentity: strings.Repeat("a", 64), Files: files}
}
func testRoot(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "owned")
	t.Setenv("DEVNEYA_HOME", root)
	actual, e := OwnedRoot()
	if e != nil {
		t.Fatal(e)
	}
	return actual
}
func TestParse(t *testing.T) {
	base := t.TempDir()
	for _, args := range [][]string{{"--unknown"}, {"--resume"}, {"doctor", "--x"}, {"repair", "extra"}, {"--cwd", "a", "--cwd", "b"}, {"--version", "--help"}, {"--resume", "--help"}, {"--resume", ""}, {"--"}} {
		if _, err := Parse(args, base); err == nil {
			t.Fatalf("accepted %q", args)
		}
	}
	got, err := Parse([]string{"--cwd", "sub dir", "--resume", "session-123"}, base)
	if err != nil || got.CWD != filepath.Join(base, "sub dir") || got.Resume != "session-123" {
		t.Fatalf("%+v %v", got, err)
	}
}
func TestRootPolicy(t *testing.T) {
	home := t.TempDir()
	for _, bad := range []string{"relative", home, filepath.VolumeName(home) + string(filepath.Separator)} {
		if _, e := ResolveRoot(func(k string) string {
			if k == "DEVNEYA_HOME" {
				return bad
			}
			return ""
		}, home, "linux"); e == nil {
			t.Fatal("accepted", bad)
		}
	}
	root, e := ResolveRoot(func(k string) string {
		if k == "XDG_DATA_HOME" {
			return "relative"
		}
		return ""
	}, home, "linux")
	if e != nil || root != filepath.Join(home, ".local/share/devneya") {
		t.Fatal(root, e)
	}
}
func TestUnownedRootPreserved(t *testing.T) {
	root := t.TempDir()
	f := filepath.Join(root, "user-file")
	os.WriteFile(f, []byte("keep"), 0600)
	t.Setenv("DEVNEYA_HOME", root)
	if _, e := OwnedRoot(); e == nil {
		t.Fatal("claimed nonempty directory")
	}
	body, _ := os.ReadFile(f)
	if string(body) != "keep" {
		t.Fatal("modified unrelated data")
	}
}
func TestRootSymlinkRejected(t *testing.T) {
	root := filepath.Join(t.TempDir(), "link")
	if e := os.Symlink(t.TempDir(), root); e != nil {
		t.Fatal("symlink creation unavailable:", e)
	}
	t.Setenv("DEVNEYA_HOME", root)
	if _, e := OwnedRoot(); e == nil {
		t.Fatal("accepted symlink root")
	}
}
func TestExtractRepairPreservesData(t *testing.T) {
	archive, m := fixture(t)
	root := testRoot(t)
	data := filepath.Join(root, "data", "credential-test")
	os.WriteFile(data, []byte("fake-test-only"), 0600)
	dir, e := EnsureRuntime(root, archive, m, false)
	if e != nil {
		t.Fatal(e)
	}
	for _, damage := range []string{"missing", "changed", "extra", "marker"} {
		f := filepath.Join(dir, "app", "entry.mjs")
		switch damage {
		case "missing":
			os.Remove(f)
		case "changed":
			os.WriteFile(f, []byte("corrupted"), 0644)
		case "extra":
			os.WriteFile(filepath.Join(dir, "extra"), []byte("x"), 0644)
		case "marker":
			os.WriteFile(filepath.Join(dir, completion), []byte(`{"identity":"wrong"}`), 0600)
		}
		if _, e = EnsureRuntime(root, archive, m, false); e != nil {
			t.Fatal(damage, e)
		}
		if e = validateTree(dir, m, true); e != nil {
			t.Fatal(e)
		}
	}
	if _, e = EnsureRuntime(root, archive, m, true); e != nil {
		t.Fatal(e)
	}
	body, _ := os.ReadFile(data)
	if string(body) != "fake-test-only" {
		t.Fatal("repair changed data")
	}
	q, _ := os.ReadDir(filepath.Join(root, "runtime", "quarantine"))
	if len(q) != 5 {
		t.Fatal("invalid runtimes were not quarantined", len(q))
	}
}
func TestConcurrentRuntimePublication(t *testing.T) {
	archive, m := fixture(t)
	root := testRoot(t)
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			dir, e := EnsureRuntime(root, archive, m, false)
			if e == nil {
				e = validateTree(dir, m, true)
			}
			errs <- e
		}()
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
}
func TestInterruptedExtraction(t *testing.T) {
	archive, m := fixture(t)
	root := testRoot(t)
	partial := filepath.Join(root, "runtime", ".staging-abandoned")
	os.Mkdir(partial, 0700)
	os.WriteFile(filepath.Join(partial, "incomplete"), []byte("x"), 0600)
	if _, e := EnsureRuntime(root, archive, m, false); e != nil {
		t.Fatal(e)
	}
}
func TestUnsafeArchiveEntries(t *testing.T) {
	for _, name := range []string{"../escape", "/absolute", "C:/drive", "\\\\server\\file", "a/../b", "a\\b", "a//b", "./a", "CON.txt", "dir/AUX", "a.", "trailing ", "a:stream"} {
		if safeName(name) == nil {
			t.Fatal("accepted", name)
		}
	}
	for _, mode := range []os.FileMode{os.ModeSymlink | 0777, os.ModeNamedPipe | 0600} {
		var b bytes.Buffer
		z := zip.NewWriter(&b)
		h := &zip.FileHeader{Name: "file"}
		h.SetMode(mode)
		w, _ := z.CreateHeader(h)
		w.Write([]byte("x"))
		z.Close()
		m := Metadata{Files: map[string]File{"file": {Size: 1, SHA256: digest([]byte("x")), Mode: 0644}}}
		if extract(b.Bytes(), t.TempDir(), m) == nil {
			t.Fatal("accepted nonregular")
		}
	}
}
func TestDuplicateAndCollidingPaths(t *testing.T) {
	for _, paths := range [][]string{{"a", "a"}, {"a", "A"}, {"Foo/a", "foo/b"}, {"a", "a/b"}} {
		var b bytes.Buffer
		z := zip.NewWriter(&b)
		m := Metadata{Files: map[string]File{}}
		for _, p := range paths {
			w, _ := z.Create(p)
			w.Write([]byte("x"))
			m.Files[p] = File{Size: 1, SHA256: digest([]byte("x")), Mode: 0644}
		}
		z.Close()
		if extract(b.Bytes(), t.TempDir(), m) == nil {
			t.Fatal("accepted", paths)
		}
	}
}
func TestManifestAndIdentity(t *testing.T) {
	archive, m := fixture(t)
	m.Files["bin/node"] = File{Size: 1, SHA256: digest([]byte("x")), Mode: 0644}
	if extract(archive, t.TempDir(), m) == nil {
		t.Fatal("accepted mismatch")
	}
	meta := Metadata{SchemaVersion: 1, Product: "devneya", BuildID: strings.Repeat("a", 20), FullIdentity: strings.Repeat("a", 64), Files: m.Files}
	b, _ := json.Marshal(meta)
	if _, e := ReadMetadata(payload.Input{Archive: archive, Metadata: b}); e == nil {
		t.Fatal("accepted false build identity")
	}
}
func TestEnvironment(t *testing.T) {
	env := Environment("/owned", "/runtime", Metadata{BuildID: "test"}, []string{"HOME=/real-home", "NODE_OPTIONS=--bad", "NODE_PATH=/bad", "DSH_HOME=/unrelated", "PATH=/stubs", "PROVIDER_KEY=fake-fixture"})
	values := map[string]string{}
	for _, e := range env {
		k, v, _ := strings.Cut(e, "=")
		values[k] = v
	}
	if values["HOME"] != "/real-home" || values["PROVIDER_KEY"] != "fake-fixture" {
		t.Fatal("normal environment changed")
	}
	if _, ok := values["NODE_OPTIONS"]; ok {
		t.Fatal("inherited Node options")
	}
	if values["DSH_HOME"] != filepath.Join("/owned", "data") {
		t.Fatal("unmanaged DSH home")
	}
	if !strings.HasPrefix(values["PATH"], filepath.Join("/runtime", "bin")) {
		t.Fatal("bundled Node not first on PATH")
	}
}
func TestDevelopmentVersionWithoutStorage(t *testing.T) {
	t.Setenv("DEVNEYA_HOME", "relative-invalid")
	var out, err bytes.Buffer
	if code := Run([]string{"--version"}, &out, &err); code != 0 {
		t.Fatal(code, err.String())
	}
	if !strings.Contains(out.String(), "0.2.0-rc.2") {
		t.Fatal(out.String())
	}
	out.Reset()
	if code := Run(nil, &out, &err); code != 1 {
		t.Fatal("dev launch should fail without payload", code)
	}
}

func TestConcurrentOwnershipInitialization(t *testing.T) {
	root := filepath.Join(t.TempDir(), "fresh")
	t.Setenv("DEVNEYA_HOME", root)
	var wg sync.WaitGroup
	errs := make(chan error, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := OwnedRoot(); errs <- err }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
}
