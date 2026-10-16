//go:build release

package payload

import _ "embed"

//go:embed generated/payload.zip
var archive []byte

//go:embed generated/metadata.json
var metadata []byte

func Embedded() Input { return Input{Archive: archive, Metadata: metadata} }
