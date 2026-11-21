package main

import (
	"sync"
	"time"
)

// testScreen is a synthetic desktop used by tests and by --demo.
type testScreen struct {
	W, H int
	mu   sync.Mutex
	tick int
}

func (t *testScreen) Frame() (Frame, error) {
	t.mu.Lock()
	t.tick = int(time.Now().UnixMilli()/500) % 256
	n := t.tick
	t.mu.Unlock()
	pix := make([]byte, t.W*t.H*4)
	for y := 0; y < t.H; y++ {
		for x := 0; x < t.W; x++ {
			i := (y*t.W + x) * 4
			pix[i], pix[i+1], pix[i+2], pix[i+3] = byte(x*255/t.W), byte(y*255/t.H), byte(n), 255
		}
	}
	return Frame{W: t.W, H: t.H, Pix: pix}, nil
}

type recordingInput struct {
	mu     sync.Mutex
	events []string
}

func (r *recordingInput) add(s string) { r.mu.Lock(); r.events = append(r.events, s); r.mu.Unlock() }
func (r *recordingInput) Pointer(x, y int, b uint8) {
	r.add("ptr " + itoa(x) + "," + itoa(y) + " " + itoa(int(b)))
}
func (r *recordingInput) Key(k uint32, down bool) {
	r.add("key " + itoa(int(k)) + map[bool]string{true: " down", false: " up"}[down])
}
func (r *recordingInput) Clipboard(t string) { r.add("clip " + t) }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}
