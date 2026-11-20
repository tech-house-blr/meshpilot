package main

import (
	"bufio"
	"encoding/binary"
	"io"
	"net"
	"strings"
	"testing"
	"time"
)

const tok = "secret-token"

func start(t *testing.T, scr Capturer, in Injector) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go serveConn(c, hashToken(tok), scr, in, "test")
		}
	}()
	return ln.Addr().String()
}

func dial(t *testing.T, addr, token string) (net.Conn, *bufio.Reader, string) {
	t.Helper()
	c, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { c.Close() })
	c.SetDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(c, preamble+token+"\n")
	r := bufio.NewReader(c)
	line, _ := r.ReadString('\n')
	return c, r, strings.TrimSpace(line)
}

func handshake(t *testing.T, c net.Conn, r *bufio.Reader) (w, h int) {
	t.Helper()
	ver := make([]byte, 12)
	io.ReadFull(r, ver)
	io.WriteString(c, "RFB 003.008\n")
	n, _ := r.ReadByte()
	types := make([]byte, n)
	io.ReadFull(r, types)
	c.Write([]byte{1})
	res := make([]byte, 4)
	io.ReadFull(r, res)
	if binary.BigEndian.Uint32(res) != 0 {
		t.Fatal("security result not OK")
	}
	c.Write([]byte{1})
	init := make([]byte, 24)
	if _, err := io.ReadFull(r, init); err != nil {
		t.Fatal(err)
	}
	nl := binary.BigEndian.Uint32(init[20:])
	io.ReadFull(r, make([]byte, nl))
	return int(binary.BigEndian.Uint16(init[0:])), int(binary.BigEndian.Uint16(init[2:]))
}

func request(c net.Conn, inc byte, x, y, w, h int) {
	b := []byte{3, inc, 0, 0, 0, 0, 0, 0, 0, 0, 0}
	binary.BigEndian.PutUint16(b[2:], uint16(x))
	binary.BigEndian.PutUint16(b[4:], uint16(y))
	binary.BigEndian.PutUint16(b[6:], uint16(w))
	binary.BigEndian.PutUint16(b[8:], uint16(h))
	c.Write(b)
}

func TestBadTokenRejected(t *testing.T) {
	addr := start(t, &testScreen{W: 64, H: 32}, &recordingInput{})
	_, _, resp := dial(t, addr, "wrong")
	if resp != "ERR" {
		t.Fatalf("got %q, want ERR", resp)
	}
}

func TestMalformedPreambleRejected(t *testing.T) {
	addr := start(t, &testScreen{W: 64, H: 32}, &recordingInput{})
	c, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	c.SetDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(c, "RFB 003.008\n")
	line, _ := bufio.NewReader(c).ReadString('\n')
	if strings.TrimSpace(line) != "ERR" {
		t.Fatalf("got %q", line)
	}
}

func TestFramebufferAndPixelFormat(t *testing.T) {
	addr := start(t, &testScreen{W: 64, H: 32}, &recordingInput{})
	c, r, resp := dial(t, addr, tok)
	if resp != "OK" {
		t.Fatal(resp)
	}
	w, h := handshake(t, c, r)
	if w != 64 || h != 32 {
		t.Fatalf("size %dx%d", w, h)
	}
	request(c, 0, 0, 0, 64, 32)
	hdr := make([]byte, 16)
	if _, err := io.ReadFull(r, hdr); err != nil {
		t.Fatal(err)
	}
	if hdr[0] != 0 || binary.BigEndian.Uint16(hdr[2:]) != 1 || int32(binary.BigEndian.Uint32(hdr[12:])) != encRaw {
		t.Fatalf("bad update header % x", hdr)
	}
	px := make([]byte, 64*32*4)
	io.ReadFull(r, px)
	// pixel (63,31) is red=63*255/64=251, green=31*255/32=247 in 0x00RRGGBB little endian
	i := (31*64 + 63) * 4
	if px[i+2] != 251 || px[i+1] != 247 {
		t.Fatalf("pixel bytes % x", px[i:i+4])
	}
}

func TestInputReachesInjector(t *testing.T) {
	in := &recordingInput{}
	addr := start(t, &testScreen{W: 64, H: 32}, in)
	c, r, _ := dial(t, addr, tok)
	handshake(t, c, r)
	c.Write([]byte{5, 1, 0, 10, 0, 20})               // pointer: left button at 10,20
	c.Write([]byte{4, 1, 0, 0, 0, 0, 0, 0x61})        // key 'a' down
	c.Write([]byte{6, 0, 0, 0, 0, 0, 0, 2, 'h', 'i'}) // clipboard "hi"
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		in.mu.Lock()
		n := len(in.events)
		in.mu.Unlock()
		if n == 3 {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	in.mu.Lock()
	defer in.mu.Unlock()
	want := []string{"ptr 10,20 1", "key 97 down", "clip hi"}
	if len(in.events) != 3 {
		t.Fatalf("events %v", in.events)
	}
	for i := range want {
		if in.events[i] != want[i] {
			t.Fatalf("event %d: %q want %q", i, in.events[i], want[i])
		}
	}
}

type resizable struct{ s *testScreen }

func (r resizable) Frame() (Frame, error) { return r.s.Frame() }

func TestDesktopResize(t *testing.T) {
	scr := &testScreen{W: 64, H: 32}
	addr := start(t, resizable{scr}, &recordingInput{})
	c, r, _ := dial(t, addr, tok)
	handshake(t, c, r)
	enc := []byte{2, 0, 0, 1, 0, 0, 0, 0}
	binary.BigEndian.PutUint32(enc[4:], uint32(0xFFFFFF21)) // -223
	c.Write(enc)
	scr.mu.Lock()
	scr.W, scr.H = 80, 40
	scr.mu.Unlock()
	request(c, 0, 0, 0, 64, 32)
	hdr := make([]byte, 16)
	if _, err := io.ReadFull(r, hdr); err != nil {
		t.Fatal(err)
	}
	if int32(binary.BigEndian.Uint32(hdr[12:])) != encDesktopSize || binary.BigEndian.Uint16(hdr[8:]) != 80 || binary.BigEndian.Uint16(hdr[10:]) != 40 {
		t.Fatalf("bad resize header % x", hdr)
	}
}

func TestIncrementalWaitsForChange(t *testing.T) {
	// a static screen: after the first full update, an incremental request gets no reply
	addr := start(t, staticScreen{}, &recordingInput{})
	c, r, _ := dial(t, addr, tok)
	handshake(t, c, r)
	request(c, 0, 0, 0, 8, 8)
	io.ReadFull(r, make([]byte, 16+8*8*4))
	request(c, 1, 0, 0, 8, 8)
	c.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if n, _ := r.Read(make([]byte, 1)); n != 0 {
		t.Fatal("unexpected update for unchanged screen")
	}
}

type staticScreen struct{}

func (staticScreen) Frame() (Frame, error) {
	return Frame{W: 8, H: 8, Pix: make([]byte, 8*8*4)}, nil
}
