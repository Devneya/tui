//go:build !release

package payload

func Embedded() Input {
	return Input{Metadata: []byte(`{"schemaVersion":1,"product":"devneya","version":"0.1.0","nodeVersion":"24.22.0","dshVersion":"0.2.0-rc.2","tuiVersion":"0.15.0","buildId":"development","fullIdentity":"","target":"development","files":{}}`)}
}
