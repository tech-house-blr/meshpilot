package main

import (
	"encoding/binary"
	"errors"
)

// pixelFormat is the RFB PIXEL_FORMAT structure.
type pixelFormat struct {
	bpp, depth         uint8
	bigEndian, trueCol bool
	max                [3]uint16 // r, g, b
	shift              [3]uint8
}

// defaultFormat is 32 bits per pixel, little endian, 0x00RRGGBB.
var defaultFormat = pixelFormat{bpp: 32, depth: 24, trueCol: true, max: [3]uint16{255, 255, 255}, shift: [3]uint8{16, 8, 0}}

func (p pixelFormat) marshal() []byte {
	b := make([]byte, 16)
	b[0], b[1] = p.bpp, p.depth
	if p.bigEndian {
		b[2] = 1
	}
	if p.trueCol {
		b[3] = 1
	}
	for i := 0; i < 3; i++ {
		binary.BigEndian.PutUint16(b[4+2*i:], p.max[i])
		b[10+i] = p.shift[i]
	}
	return b
}

func parsePixelFormat(b []byte) (pixelFormat, error) {
	p := pixelFormat{bpp: b[0], depth: b[1], bigEndian: b[2] != 0, trueCol: b[3] != 0}
	for i := 0; i < 3; i++ {
		p.max[i] = binary.BigEndian.Uint16(b[4+2*i:])
		p.shift[i] = b[10+i]
	}
	if !p.trueCol {
		return p, errors.New("colour-map pixel formats are not supported")
	}
	if p.bpp != 8 && p.bpp != 16 && p.bpp != 32 {
		return p, errors.New("unsupported bits per pixel")
	}
	for i := 0; i < 3; i++ {
		if p.max[i] == 0 || p.shift[i] > 31 {
			return p, errors.New("invalid colour channel")
		}
	}
	return p, nil
}

// encodeRect converts the rectangle (x,y,w,h) of an RGBA frame into the client's pixel format.
func encodeRect(f Frame, x, y, w, h int, p pixelFormat) []byte {
	bytesPer := int(p.bpp) / 8
	out := make([]byte, w*h*bytesPer)
	o := 0
	for row := y; row < y+h; row++ {
		src := f.Pix[(row*f.W+x)*4:]
		for col := 0; col < w; col++ {
			r, g, b := uint32(src[col*4]), uint32(src[col*4+1]), uint32(src[col*4+2])
			v := (r*uint32(p.max[0])/255)<<p.shift[0] | (g*uint32(p.max[1])/255)<<p.shift[1] | (b*uint32(p.max[2])/255)<<p.shift[2]
			switch p.bpp {
			case 32:
				if p.bigEndian {
					binary.BigEndian.PutUint32(out[o:], v)
				} else {
					binary.LittleEndian.PutUint32(out[o:], v)
				}
			case 16:
				if p.bigEndian {
					binary.BigEndian.PutUint16(out[o:], uint16(v))
				} else {
					binary.LittleEndian.PutUint16(out[o:], uint16(v))
				}
			default:
				out[o] = byte(v)
			}
			o += bytesPer
		}
	}
	return out
}
