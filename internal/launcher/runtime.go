package launcher

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofrs/flock"
)

const completion = ".devneya-complete.json"

func safeName(name string) error {
	if name == "" || strings.ContainsAny(name, "\\:\x00") || strings.HasPrefix(name, "/") || path.Clean(name) != name || name == "." || name == ".." || strings.HasPrefix(name, "../") {
		return fmt.Errorf("unsafe payload path: %q", name)
	}
	for _, part := range strings.Split(name, "/") {
		if strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") || strings.ContainsAny(part, "<>\"|?*") {
			return fmt.Errorf("nonportable payload path: %q", name)
		}
		stem := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		if stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" || len(stem) == 4 && (strings.HasPrefix(stem, "COM") || strings.HasPrefix(stem, "LPT")) && stem[3] >= '1' && stem[3] <= '9' {
			return fmt.Errorf("reserved payload path: %q", name)
		}
	}
	return nil
}
func manifestNames(m Metadata) (map[string]bool, error) {
	names := map[string]bool{}
	folded := map[string]string{}
	kinds := map[string]bool{}
	for name, f := range m.Files {
		if err := safeName(name); err != nil {
			return nil, err
		}
		if name == completion || f.Size < 0 || len(f.SHA256) != 64 || f.Mode != 0644 && f.Mode != 0755 {
			return nil, fmt.Errorf("invalid manifest entry: %s", name)
		}
		if _, err := hex.DecodeString(f.SHA256); err != nil {
			return nil, err
		}
		for current, isFile := name, true; current != "."; current, isFile = path.Dir(current), false {
			low := strings.ToLower(current)
			if previous, exists := folded[low]; exists && (previous != current || kinds[low] != isFile) {
				return nil, fmt.Errorf("payload filename collision: %s", name)
			}
			folded[low] = current
			kinds[low] = isFile
		}
		names[name] = true
	}
	return names, nil
}
func checkFile(filename string, f File) error {
	st, err := os.Lstat(filename)
	if err != nil {
		return err
	}
	if !st.Mode().IsRegular() || st.Size() != f.Size {
		return fmt.Errorf("runtime file size/type mismatch: %s", filename)
	}
	if os.PathSeparator != '\\' && uint32(st.Mode().Perm()) != f.Mode {
		return fmt.Errorf("runtime file permission mismatch: %s", filename)
	}
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()
	h := sha256.New()
	if _, err = io.Copy(h, file); err != nil {
		return err
	}
	if hex.EncodeToString(h.Sum(nil)) != f.SHA256 {
		return fmt.Errorf("runtime file digest mismatch: %s", filename)
	}
	return nil
}
func validateTree(dir string, m Metadata, completed bool) error {
	st, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("invalid runtime directory")
	}
	expected, err := manifestNames(m)
	if err != nil {
		return err
	}
	dirs := map[string]bool{".": true}
	for n := range expected {
		for d := path.Dir(n); d != "."; d = path.Dir(d) {
			dirs[d] = true
		}
	}
	seen := map[string]bool{}
	err = filepath.WalkDir(dir, func(p string, d fs.DirEntry, e error) error {
		if e != nil {
			return e
		}
		rel, e := filepath.Rel(dir, p)
		if e != nil {
			return e
		}
		rel = filepath.ToSlash(rel)
		if d.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("runtime contains a symlink: %s", rel)
		}
		if d.IsDir() {
			if !dirs[rel] {
				return fmt.Errorf("unexpected runtime directory: %s", rel)
			}
			return nil
		}
		if rel == completion && completed {
			st, e := d.Info()
			if e != nil {
				return e
			}
			if !st.Mode().IsRegular() || st.Size() > 1024 {
				return fmt.Errorf("invalid runtime completion record")
			}
			b, e := os.ReadFile(p)
			if e != nil {
				return e
			}
			var v struct {
				Identity string `json:"identity"`
			}
			if json.Unmarshal(b, &v) != nil || v.Identity != m.FullIdentity {
				return fmt.Errorf("runtime identity mismatch")
			}
			seen[rel] = true
			return nil
		}
		f, ok := m.Files[rel]
		if !ok {
			return fmt.Errorf("unexpected runtime file: %s", rel)
		}
		seen[rel] = true
		return checkFile(p, f)
	})
	if err != nil {
		return err
	}
	for n := range expected {
		if !seen[n] {
			return fmt.Errorf("runtime file missing: %s", n)
		}
	}
	if completed && !seen[completion] {
		return fmt.Errorf("runtime completion record missing")
	}
	return nil
}
func extract(archive []byte, dir string, m Metadata) error {
	if _, err := manifestNames(m); err != nil {
		return err
	}
	z, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	folded := map[string]bool{}
	for _, f := range z.File {
		name := strings.TrimSuffix(f.Name, "/")
		if err = safeName(name); err != nil {
			return err
		}
		low := strings.ToLower(name)
		if folded[low] {
			return fmt.Errorf("duplicate archive destination: %s", name)
		}
		folded[low] = true
		if f.Mode()&os.ModeSymlink != 0 || !f.Mode().IsRegular() && !f.Mode().IsDir() {
			return fmt.Errorf("nonregular archive entry: %s", name)
		}
		if f.FileInfo().IsDir() {
			allowed := false
			for expected := range m.Files {
				if strings.HasPrefix(expected, name+"/") {
					allowed = true
					break
				}
			}
			if !allowed {
				return fmt.Errorf("unexpected payload directory: %s", name)
			}
			if err = os.MkdirAll(filepath.Join(dir, filepath.FromSlash(name)), 0700); err != nil {
				return err
			}
			continue
		}
		spec, ok := m.Files[name]
		if !ok || uint64(spec.Size) != f.UncompressedSize64 {
			return fmt.Errorf("archive entry differs from manifest: %s", name)
		}
		dst := filepath.Join(dir, filepath.FromSlash(name))
		if err = os.MkdirAll(filepath.Dir(dst), 0700); err != nil {
			return err
		}
		source, e := f.Open()
		if e != nil {
			return e
		}
		target, e := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, os.FileMode(spec.Mode))
		if e != nil {
			source.Close()
			return e
		}
		_, e = io.CopyN(target, source, spec.Size)
		if e == nil {
			var one [1]byte
			n, readErr := source.Read(one[:])
			if n != 0 || readErr != io.EOF {
				e = fmt.Errorf("archive size/checksum mismatch: %s", name)
			}
		}
		// This tree is a repairable cache. Closing each file and validating
		// all bytes before publication avoids 33,000 synchronous disk flushes.
		// Every later launch revalidates, including after interrupted power.
		closeErr := target.Close()
		source.Close()
		if e != nil {
			return e
		}
		if closeErr != nil {
			return closeErr
		}
		if err = os.Chmod(dst, os.FileMode(spec.Mode)); err != nil {
			return err
		}
		seen[name] = true
	}
	if len(seen) != len(m.Files) {
		return fmt.Errorf("archive omits manifest files")
	}
	return validateTree(dir, m, false)
}
func EnsureRuntime(root string, archive []byte, m Metadata, repair bool) (string, error) {
	if len(archive) == 0 {
		return "", fmt.Errorf("this development build has no embedded runtime; build a release payload before launching")
	}
	if len(m.BuildID) != 20 || strings.ContainsAny(m.BuildID, "/\\.") {
		return "", fmt.Errorf("invalid build ID")
	}
	dir := filepath.Join(root, "runtime", m.BuildID)
	lockPath := filepath.Join(root, "runtime", "locks", m.BuildID+".lock")
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err == nil {
		f.Close()
	} else if !os.IsExist(err) {
		return "", err
	}
	st, err := os.Lstat(lockPath)
	if err != nil || !st.Mode().IsRegular() {
		return "", fmt.Errorf("invalid runtime lock")
	}
	lock := flock.New(lockPath)
	defer lock.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	ok, err := lock.TryLockContext(ctx, 100*time.Millisecond)
	if err != nil || !ok {
		return "", fmt.Errorf("runtime lock unavailable after bounded wait: %w", ctx.Err())
	}
	defer lock.Unlock()
	if !repair && validateTree(dir, m, true) == nil {
		return dir, nil
	}
	stage, err := os.MkdirTemp(filepath.Join(root, "runtime"), ".staging-"+m.BuildID+"-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(stage)
	if err = extract(archive, stage, m); err != nil {
		return "", fmt.Errorf("runtime extraction failed: %w", err)
	}
	record, _ := json.Marshal(map[string]string{"identity": m.FullIdentity})
	recordFile, err := os.OpenFile(filepath.Join(stage, completion), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return "", err
	}
	_, writeErr := recordFile.Write(record)
	syncErr := recordFile.Sync()
	closeErr := recordFile.Close()
	if writeErr != nil {
		return "", writeErr
	}
	if syncErr != nil {
		return "", syncErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	if err = validateTree(stage, m, true); err != nil {
		return "", err
	}
	if _, e := os.Lstat(dir); e == nil {
		quarantine := filepath.Join(root, "runtime", "quarantine", m.BuildID+"-"+filepath.Base(stage))
		if err = os.Rename(dir, quarantine); err != nil {
			return "", fmt.Errorf("cannot quarantine invalid or in-use runtime; close other devneya processes and retry: %w", err)
		}
	} else if !os.IsNotExist(e) {
		return "", e
	}
	if err = os.Rename(stage, dir); err != nil {
		return "", fmt.Errorf("cannot publish complete runtime: %w", err)
	}
	return dir, nil
}
