package main

// Frame is one captured screen image: W*H pixels, 4 bytes each in R,G,B,A order.
type Frame struct {
	W, H int
	Pix  []byte
}

// Capturer produces screen frames. Each OS provides its own implementation.
type Capturer interface {
	Frame() (Frame, error)
}

// Injector applies remote input to the machine. Each OS provides its own implementation.
type Injector interface {
	// Pointer reports the pointer position in screen pixels and the pressed buttons
	// (bit 0 left, bit 1 middle, bit 2 right, bits 3-6 wheel and extra buttons, as in RFB).
	Pointer(x, y int, buttons uint8)
	// Key reports an X11 keysym going down or up.
	Key(keysym uint32, down bool)
	// Clipboard receives text sent from the browser.
	Clipboard(text string)
}
