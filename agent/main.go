// meshpilot-agent shares this machine's screen with a Mesh Pilot server over RFB.
package main

import (
	"bufio"
	"flag"
	"log"
	"net"
	"os"
	"strings"
	"time"
)

func serveConn(conn net.Conn, tokenHash string, c Capturer, i Injector, name string) {
	defer conn.Close()
	r := bufio.NewReader(conn)
	if err := checkPreamble(r, conn, tokenHash, 5*time.Second, func(t time.Time) { conn.SetDeadline(t) }); err != nil {
		log.Printf("%s: rejected: %v", conn.RemoteAddr(), err)
		return
	}
	log.Printf("%s: connected", conn.RemoteAddr())
	err := newSession(conn, r, c, i, name).serve()
	log.Printf("%s: closed: %v", conn.RemoteAddr(), err)
}

func main() {
	listen := flag.String("listen", "127.0.0.1:5901", "address to listen on (use the Tailscale address in production)")
	hash := flag.String("token-hash", os.Getenv("MESHPILOT_AGENT_TOKEN_HASH"), "SHA-256 hex of the access token")
	demo := flag.Bool("demo", false, "serve a synthetic screen and log input instead of using the real desktop")
	flag.Parse()
	if len(*hash) != 64 {
		log.Fatal("a 64-character --token-hash (or MESHPILOT_AGENT_TOKEN_HASH) is required")
	}
	if !*demo {
		log.Fatal("no screen backend for this platform yet; use --demo")
	}
	host, _ := os.Hostname()
	name := "Mesh Pilot agent on " + strings.TrimSpace(host)
	var in Injector = &logInput{}
	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("listening on %s", ln.Addr())
	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Fatal(err)
		}
		go serveConn(conn, strings.ToLower(*hash), &testScreen{W: 640, H: 360}, in, name)
	}
}

type logInput struct{}

func (logInput) Pointer(x, y int, b uint8) { log.Printf("pointer %d,%d buttons=%d", x, y, b) }
func (logInput) Key(k uint32, down bool)   { log.Printf("key %#x down=%v", k, down) }
func (logInput) Clipboard(t string)        { log.Printf("clipboard %d bytes", len(t)) }
