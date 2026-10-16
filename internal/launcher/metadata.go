package launcher

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/Devneya/tui/internal/payload"
)

type File struct {
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
	Mode   uint32 `json:"mode"`
}
type Metadata struct {
	SchemaVersion int             `json:"schemaVersion"`
	Product       string          `json:"product"`
	Version       string          `json:"version"`
	BuildID       string          `json:"buildId"`
	FullIdentity  string          `json:"fullIdentity"`
	Target        string          `json:"target"`
	SourceCommit  string          `json:"sourceCommit"`
	NodeVersion   string          `json:"nodeVersion"`
	DSHVersion    string          `json:"dshVersion"`
	TUIVersion    string          `json:"tuiVersion"`
	Identity      map[string]any  `json:"identity"`
	Files         map[string]File `json:"files"`
}

func digest(b []byte) string { h := sha256.Sum256(b); return hex.EncodeToString(h[:]) }
func ReadMetadata(in payload.Input) (Metadata, error) {
	var m Metadata
	if err := json.Unmarshal(in.Metadata, &m); err != nil {
		return m, fmt.Errorf("invalid embedded build metadata: %w", err)
	}
	if m.SchemaVersion != 1 || m.Product != "devneya" {
		return m, fmt.Errorf("unsupported build metadata")
	}
	if len(in.Archive) == 0 {
		return m, nil
	}
	encoded, err := json.Marshal(m.Identity)
	if err != nil {
		return m, err
	}
	if m.FullIdentity != digest(encoded) || len(m.FullIdentity) != 64 || m.BuildID != m.FullIdentity[:20] {
		return m, fmt.Errorf("embedded build identity does not match")
	}
	if m.Identity["payloadSha256"] != digest(in.Archive) || m.Identity["sourceCommit"] != m.SourceCommit || m.Identity["target"] != m.Target || m.Identity["payloadFormatVersion"] != float64(1) {
		return m, fmt.Errorf("embedded payload identity does not match")
	}
	if len(m.Files) == 0 {
		return m, fmt.Errorf("empty payload manifest")
	}
	return m, nil
}
