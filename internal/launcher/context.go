package launcher

import (
	"context"
	"time"
)

func doctorContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), timeout)
}
