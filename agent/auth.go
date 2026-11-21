package main

import (
	"bufio"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"time"
)

// Every connection starts with one line, "MPAGENT1 <token>\n". The agent stores only the
// SHA-256 of the token. After a correct line it answers "OK\n" and RFB begins.
const preamble = "MPAGENT1 "

var errAuth = errors.New("authentication failed")

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func checkPreamble(r *bufio.Reader, w io.Writer, wantHash string, limit time.Duration, setDeadline func(time.Time)) error {
	setDeadline(time.Now().Add(limit))
	defer setDeadline(time.Time{})
	line, err := r.ReadString('\n')
	if err != nil || len(line) > 256 || !strings.HasPrefix(line, preamble) {
		io.WriteString(w, "ERR\n")
		return errAuth
	}
	got := hashToken(strings.TrimSpace(strings.TrimPrefix(line, preamble)))
	if subtle.ConstantTimeCompare([]byte(got), []byte(wantHash)) != 1 {
		io.WriteString(w, "ERR\n")
		return errAuth
	}
	_, err = io.WriteString(w, "OK\n")
	return err
}
