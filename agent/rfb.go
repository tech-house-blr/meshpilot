package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"sync"
	"time"
)

const (
	encRaw         = 0
	encDesktopSize = -223
	maxCutText     = 1 << 20
	tick           = 40 * time.Millisecond
)

type updateRequest struct {
	incremental bool
	x, y, w, h  int
}

// session serves one RFB client.
type session struct {
	conn net.Conn
	r    *bufio.Reader
	cap  Capturer
	inj  Injector
	name string

	wmu sync.Mutex // serialises writes to the client

	mu          sync.Mutex
	pf          pixelFormat
	pending     *updateRequest
	desktopSize bool
	sentW       int
	sentH       int
	lastHash    [32]byte
	haveHash    bool
	forceFull   bool
}

func newSession(conn net.Conn, r *bufio.Reader, c Capturer, i Injector, name string) *session {
	return &session{conn: conn, r: r, cap: c, inj: i, name: name, pf: defaultFormat}
}

func (s *session) write(b []byte) error {
	s.wmu.Lock()
	defer s.wmu.Unlock()
	_, err := s.conn.Write(b)
	return err
}

func (s *session) handshake() error {
	if err := s.write([]byte("RFB 003.008\n")); err != nil {
		return err
	}
	ver := make([]byte, 12)
	if _, err := io.ReadFull(s.r, ver); err != nil {
		return err
	}
	if string(ver) != "RFB 003.008\n" && string(ver) != "RFB 003.007\n" {
		return fmt.Errorf("unsupported protocol version %q", ver)
	}
	// One security type: None. Access was already authenticated by the preamble.
	if err := s.write([]byte{1, 1}); err != nil {
		return err
	}
	choice := make([]byte, 1)
	if _, err := io.ReadFull(s.r, choice); err != nil {
		return err
	}
	if choice[0] != 1 {
		return errors.New("client chose an unsupported security type")
	}
	if string(ver) == "RFB 003.008\n" {
		if err := s.write([]byte{0, 0, 0, 0}); err != nil {
			return err
		}
	}
	if _, err := io.ReadFull(s.r, make([]byte, 1)); err != nil { // ClientInit (shared flag)
		return err
	}
	f, err := s.cap.Frame()
	if err != nil {
		return err
	}
	s.sentW, s.sentH = f.W, f.H
	var b bytes.Buffer
	binary.Write(&b, binary.BigEndian, uint16(f.W))
	binary.Write(&b, binary.BigEndian, uint16(f.H))
	b.Write(s.pf.marshal())
	binary.Write(&b, binary.BigEndian, uint32(len(s.name)))
	b.WriteString(s.name)
	return s.write(b.Bytes())
}

func (s *session) serve() error {
	if err := s.handshake(); err != nil {
		return err
	}
	done := make(chan struct{})
	defer close(done)
	go s.updater(done)
	for {
		if err := s.readMessage(); err != nil {
			return err
		}
	}
}

func (s *session) readMessage() error {
	t, err := s.r.ReadByte()
	if err != nil {
		return err
	}
	switch t {
	case 0: // SetPixelFormat
		b := make([]byte, 19)
		if _, err := io.ReadFull(s.r, b); err != nil {
			return err
		}
		pf, err := parsePixelFormat(b[3:])
		if err != nil {
			return err
		}
		s.mu.Lock()
		s.pf, s.forceFull = pf, true
		s.mu.Unlock()
	case 2: // SetEncodings
		b := make([]byte, 3)
		if _, err := io.ReadFull(s.r, b); err != nil {
			return err
		}
		n := int(binary.BigEndian.Uint16(b[1:]))
		enc := make([]byte, 4*n)
		if _, err := io.ReadFull(s.r, enc); err != nil {
			return err
		}
		ds := false
		for i := 0; i < n; i++ {
			if int32(binary.BigEndian.Uint32(enc[4*i:])) == encDesktopSize {
				ds = true
			}
		}
		s.mu.Lock()
		s.desktopSize = ds
		s.mu.Unlock()
	case 3: // FramebufferUpdateRequest
		b := make([]byte, 9)
		if _, err := io.ReadFull(s.r, b); err != nil {
			return err
		}
		req := &updateRequest{incremental: b[0] != 0,
			x: int(binary.BigEndian.Uint16(b[1:])), y: int(binary.BigEndian.Uint16(b[3:])),
			w: int(binary.BigEndian.Uint16(b[5:])), h: int(binary.BigEndian.Uint16(b[7:]))}
		s.mu.Lock()
		s.pending = req
		s.mu.Unlock()
	case 4: // KeyEvent
		b := make([]byte, 7)
		if _, err := io.ReadFull(s.r, b); err != nil {
			return err
		}
		s.inj.Key(binary.BigEndian.Uint32(b[3:]), b[0] != 0)
	case 5: // PointerEvent
		b := make([]byte, 5)
		if _, err := io.ReadFull(s.r, b); err != nil {
			return err
		}
		s.inj.Pointer(int(binary.BigEndian.Uint16(b[1:])), int(binary.BigEndian.Uint16(b[3:])), b[0])
	case 6: // ClientCutText
		b := make([]byte, 7)
		if _, err := io.ReadFull(s.r, b); err != nil {
			return err
		}
		n := binary.BigEndian.Uint32(b[3:])
		if n > maxCutText {
			return errors.New("clipboard text too large")
		}
		txt := make([]byte, n)
		if _, err := io.ReadFull(s.r, txt); err != nil {
			return err
		}
		s.inj.Clipboard(string(txt)) // RFB cut text is Latin-1; callers treat it as opaque bytes
	default:
		return fmt.Errorf("unknown client message %d", t)
	}
	return nil
}

func (s *session) updater(done <-chan struct{}) {
	t := time.NewTicker(tick)
	defer t.Stop()
	for {
		select {
		case <-done:
			return
		case <-t.C:
			if err := s.maybeSend(); err != nil {
				s.conn.Close()
				return
			}
		}
	}
}

func (s *session) maybeSend() error {
	s.mu.Lock()
	req := s.pending
	pf, ds, force := s.pf, s.desktopSize, s.forceFull
	s.mu.Unlock()
	if req == nil {
		return nil
	}
	f, err := s.cap.Frame()
	if err != nil {
		return nil // transient capture failure: try again on the next tick
	}
	if f.W < 1 || f.H < 1 || len(f.Pix) != f.W*f.H*4 {
		return nil
	}
	hash := sha256.Sum256(f.Pix)
	resized := f.W != s.sentW || f.H != s.sentH
	s.mu.Lock()
	changed := !s.haveHash || hash != s.lastHash
	s.mu.Unlock()
	if resized && !ds {
		return nil // client cannot follow a size change; keep the old size rather than corrupt the image
	}
	if req.incremental && !changed && !resized && !force {
		return nil
	}
	var b bytes.Buffer
	b.Write([]byte{0, 0})
	if resized {
		binary.Write(&b, binary.BigEndian, uint16(1))
		binary.Write(&b, binary.BigEndian, [4]uint16{0, 0, uint16(f.W), uint16(f.H)})
		binary.Write(&b, binary.BigEndian, int32(encDesktopSize))
		s.sentW, s.sentH = f.W, f.H
	} else {
		x, y, w, h := clip(req, f.W, f.H)
		if w == 0 || h == 0 {
			return nil
		}
		binary.Write(&b, binary.BigEndian, uint16(1))
		binary.Write(&b, binary.BigEndian, [4]uint16{uint16(x), uint16(y), uint16(w), uint16(h)})
		binary.Write(&b, binary.BigEndian, int32(encRaw))
		b.Write(encodeRect(f, x, y, w, h, pf))
	}
	if err := s.write(b.Bytes()); err != nil {
		return err
	}
	s.mu.Lock()
	s.pending, s.lastHash, s.haveHash, s.forceFull = nil, hash, true, false
	s.mu.Unlock()
	return nil
}

func clip(r *updateRequest, w, h int) (x, y, cw, ch int) {
	x, y = r.x, r.y
	if x >= w || y >= h {
		return 0, 0, 0, 0
	}
	cw, ch = r.w, r.h
	if x+cw > w {
		cw = w - x
	}
	if y+ch > h {
		ch = h - y
	}
	return
}
