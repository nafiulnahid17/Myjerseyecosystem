export const MASTER_SIZE = { width: 1408, height: 1984 };
export const INPUT_LIMIT = 10_000_000;
export type ImageKind = "image/jpeg" | "image/png" | "image/webp";

export function dimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (i: number, length: number) => String.fromCharCode(...bytes.subarray(i, i + length));
  if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a && ascii(12, 4) === "IHDR") {
    return { width: view.getUint32(16), height: view.getUint32(20), type: "image/png" as const };
  }
  if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const chunk = ascii(12, 4);
    if (chunk === "VP8X") {
      const little24 = (i: number) => bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16);
      return { width: little24(24) + 1, height: little24(27) + 1, type: "image/webp" as const };
    }
    if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff, type: "image/webp" as const };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1, type: "image/webp" as const };
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length && bytes[i] === 0xff) {
      const marker = bytes[++i];
      i++;
      if (marker === 0xff) { i--; continue; }
      if (marker === 0xda || marker === 0xd9) break;
      const size = view.getUint16(i);
      if (size < 2 || i + size > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && size >= 8) {
        return { width: view.getUint16(i + 5), height: view.getUint16(i + 3), type: "image/jpeg" as const };
      }
      i += size;
    }
  }
  return null;
}

export function imageExtension(type: string) {
  return type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg";
}

export async function sha256(data: BufferSource) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...hash].map(value => value.toString(16).padStart(2, "0")).join("");
}
