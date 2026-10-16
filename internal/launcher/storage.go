package launcher

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

type ownership struct {
	SchemaVersion int    `json:"schemaVersion"`
	Product       string `json:"product"`
}

func ResolveRoot(getenv func(string) string, home, platform string) (string, error) {
	root := getenv("DEVNEYA_HOME")
	if root != "" && !filepath.IsAbs(root) {
		return "", fmt.Errorf("DEVNEYA_HOME must be an absolute path")
	}
	if root == "" {
		switch platform {
		case "linux":
			base := getenv("XDG_DATA_HOME")
			if !filepath.IsAbs(base) {
				base = filepath.Join(home, ".local", "share")
			}
			root = filepath.Join(base, "devneya")
		case "darwin":
			root = filepath.Join(home, "Library", "Application Support", "devneya")
		case "windows":
			base := getenv("LOCALAPPDATA")
			if !filepath.IsAbs(base) {
				return "", fmt.Errorf("LOCALAPPDATA must be an absolute path")
			}
			root = filepath.Join(base, "devneya")
		default:
			return "", fmt.Errorf("unsupported operating system: %s", platform)
		}
	}
	root = filepath.Clean(root)
	if root == filepath.Dir(root) || root == filepath.Clean(home) {
		return "", fmt.Errorf("application root cannot be a filesystem root or your home directory")
	}
	return root, nil
}
func privateDir(path string) error {
	st, err := os.Lstat(path)
	if os.IsNotExist(err) {
		if err = os.Mkdir(path, 0700); err != nil && !os.IsExist(err) {
			return err
		}
		st, err = os.Lstat(path)
	}
	if err != nil {
		return err
	}
	if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("managed directory is not a real directory: %s", path)
	}
	return restrictDirectory(path)
}
func OwnedRoot() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	root, err := ResolveRoot(os.Getenv, home, runtime.GOOS)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(filepath.Dir(root), 0700); err != nil {
		return "", err
	}
	// Resolve existing ancestors before applying the home/root exclusion again.
	parent, err := filepath.EvalSymlinks(filepath.Dir(root))
	if err != nil {
		return "", err
	}
	root = filepath.Join(parent, filepath.Base(root))
	realHome, _ := filepath.EvalSymlinks(home)
	if root == realHome || root == filepath.Dir(root) {
		return "", fmt.Errorf("unsafe application root")
	}
	if st, e := os.Lstat(root); e == nil {
		if !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("application root must be a real directory")
		}
		// Windows and default macOS filesystems can spell the same home
		// directory with different case or Unicode normalization. Compare
		// filesystem identity before accepting even a valid ownership marker.
		if homeInfo, homeErr := os.Stat(home); homeErr == nil && os.SameFile(st, homeInfo) {
			return "", fmt.Errorf("application root cannot be your home directory")
		}
	} else if !os.IsNotExist(e) {
		return "", e
	}
	if err = os.Mkdir(root, 0700); err != nil && !os.IsExist(err) {
		return "", err
	}
	marker := filepath.Join(root, "ownership.json")
	st, e := os.Lstat(marker)
	if os.IsNotExist(e) {
		entries, readErr := os.ReadDir(root)
		if readErr != nil {
			return "", readErr
		}
		if len(entries) > 0 {
			// A concurrent first start may have published the complete marker.
			if _, again := os.Lstat(marker); again != nil {
				return "", fmt.Errorf("nonempty application root has no devneya ownership marker: %s", root)
			}
		} else {
			// Publish complete ownership bytes atomically. The temporary file
			// is in the parent, so another initializer never sees partial state.
			f, createErr := os.CreateTemp(filepath.Dir(root), ".devneya-ownership-")
			if createErr != nil {
				return "", createErr
			}
			temporary := f.Name()
			defer os.Remove(temporary)
			_, writeErr := f.Write([]byte("{\"schemaVersion\":1,\"product\":\"devneya\"}\n"))
			syncErr := f.Sync()
			closeErr := f.Close()
			if writeErr != nil {
				return "", writeErr
			}
			if syncErr != nil {
				return "", syncErr
			}
			if closeErr != nil {
				return "", closeErr
			}
			if linkErr := os.Link(temporary, marker); linkErr != nil && !os.IsExist(linkErr) {
				return "", linkErr
			}
		}
		st, e = os.Lstat(marker)
	}
	if e != nil {
		return "", e
	}
	if !st.Mode().IsRegular() || st.Size() > 1024 {
		return "", fmt.Errorf("invalid ownership marker")
	}
	b, err := os.ReadFile(marker)
	if err != nil {
		return "", err
	}
	var owner ownership
	if json.Unmarshal(b, &owner) != nil || owner.Product != "devneya" || owner.SchemaVersion != 1 {
		return "", fmt.Errorf("unrecognized application ownership marker")
	}
	if err = privateDir(root); err != nil {
		return "", err
	}
	for _, rel := range []string{"runtime", "runtime/locks", "runtime/quarantine", "data", "data/profiles", "data/sessions", "tui", "cache", "cache/node", "cache/tmp", "logs"} {
		if err = privateDir(filepath.Join(root, filepath.FromSlash(rel))); err != nil {
			return "", err
		}
	}
	return root, nil
}
