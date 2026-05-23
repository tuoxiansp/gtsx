import { writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { mkdirSync } from "node:fs"
import { deflateSync } from "node:zlib"

const FONT = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11110", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "#": ["01010", "11111", "01010", "11111", "01010", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
}

export function writeSnapshotPng(filePath, lines) {
  const width = 760
  const height = 420
  const pixels = Buffer.alloc(width * height * 4, 255)

  fillRect(pixels, width, 0, 0, width, height, [246, 248, 251, 255])
  fillRect(pixels, width, 0, 0, width, 72, [31, 41, 55, 255])
  fillRect(pixels, width, 32, 104, width - 64, height - 136, [255, 255, 255, 255])
  strokeRect(pixels, width, 32, 104, width - 64, height - 136, [203, 213, 225, 255])

  drawText(pixels, width, "GTSX SNAPSHOT", 36, 26, 4, [255, 255, 255, 255])
  lines.slice(0, 8).forEach((line, index) => {
    drawText(pixels, width, line.toUpperCase(), 56, 132 + index * 34, 3, [15, 23, 42, 255])
  })

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, encodePng(width, height, pixels))
}

function fillRect(pixels, width, x, y, rectWidth, rectHeight, color) {
  for (let row = y; row < y + rectHeight; row += 1) {
    for (let column = x; column < x + rectWidth; column += 1) {
      setPixel(pixels, width, column, row, color)
    }
  }
}

function strokeRect(pixels, width, x, y, rectWidth, rectHeight, color) {
  fillRect(pixels, width, x, y, rectWidth, 2, color)
  fillRect(pixels, width, x, y + rectHeight - 2, rectWidth, 2, color)
  fillRect(pixels, width, x, y, 2, rectHeight, color)
  fillRect(pixels, width, x + rectWidth - 2, y, 2, rectHeight, color)
}

function drawText(pixels, width, text, x, y, scale, color) {
  let cursor = x
  for (const rawCharacter of text) {
    const character = FONT[rawCharacter] ? rawCharacter : " "
    const glyph = FONT[character]
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== "1") continue
        fillRect(pixels, width, cursor + column * scale, y + row * scale, scale, scale, color)
      }
    }
    cursor += 6 * scale
  }
}

function setPixel(pixels, width, x, y, color) {
  const offset = (y * width + x) * 4
  pixels[offset] = color[0]
  pixels[offset + 1] = color[1]
  pixels[offset + 2] = color[2]
  pixels[offset + 3] = color[3]
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let row = 0; row < height; row += 1) {
    raw[row * (width * 4 + 1)] = 0
    rgba.copy(raw, row * (width * 4 + 1) + 1, row * width * 4, (row + 1) * width * 4)
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))])
}

function uint32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value)
  return buffer
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})
