package payload

// Input is the build-time payload; production builds embed immutable bytes.
type Input struct {
	Archive  []byte
	Metadata []byte
}
