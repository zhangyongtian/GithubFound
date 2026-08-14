const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = process.cwd();
const pub = path.join(root, "public");
const srcSvg = fs.readFileSync(path.join(pub, "favicon.svg"));

function crc32(buf) {
  let c;
  const table = (crc32.t =
    crc32.t ||
    (() => {
      const tab = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tab[n] = c >>> 0;
      }
      return tab;
    })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u32(n) {
  return Buffer.from([(n >>> 0) & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
}
function u16(n) {
  return Buffer.from([n & 255, (n >>> 8) & 255]);
}

function pngEncode(width, height, rgba) {
  const w = width;
  const h = height;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, y * w * 4 + w * 4);
  }

  function chunk(type, data) {
    const len = u32(data.length);
    const tbuf = Buffer.from(type, "ascii");
    const crc = u32(crc32(Buffer.concat([tbuf, data])));
    return Buffer.concat([len, tbuf, data, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Node built-in zlib
  const { deflateSync } = require("zlib");
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const sizes = [
  { s: 16, bpp: 32 },
  { s: 24, bpp: 32 },
  { s: 32, bpp: 32 },
  { s: 48, bpp: 32 },
  { s: 64, bpp: 32 },
  { s: 256, bpp: 32 },
];

(async () => {
  const entries = [];
  for (const { s } of sizes) {
    const rgba = await sharp(srcSvg).resize(s, s, { fit: "fill", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
    const png = pngEncode(s, s, rgba);
    entries.push({ size: s, png });
  }

  // Build ICO: ICONDIR (6) + ICONDIRENTRY(16 * N) + data
  const headerLen = 6;
  const entryLen = 16 * entries.length;
  const dataOffset = headerLen + entryLen;

  let off = dataOffset;
  const header = Buffer.concat([u16(0), u16(1), u16(entries.length)]);
  const dirs = [];
  for (const e of entries) {
    const w = e.size >= 256 ? 0 : e.size;
    const h = e.size >= 256 ? 0 : e.size;
    const bytes = e.png.length;
    dirs.push(
      Buffer.from([
        w, h, 0, 0, 1, 0, 32, 0,
        ...Array.from(u32(bytes)),
        ...Array.from(u32(off)),
      ])
    );
    off += bytes;
  }
  const ico = Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
  fs.writeFileSync(path.join(pub, "favicon.ico"), ico);
  console.log(`wrote favicon.ico (${ico.length} bytes)`);

  const logoSvg = fs.readFileSync(path.join(pub, "logo.svg"));
  const applePng = await sharp(logoSvg).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(pub, "apple-touch-icon.png"), applePng);
  console.log("wrote apple-touch-icon.png");

  // 192/512 manifest icons
  const i192 = await sharp(logoSvg).resize(192, 192).png().toBuffer();
  const i512 = await sharp(logoSvg).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(pub, "icon-192.png"), i192);
  fs.writeFileSync(path.join(pub, "icon-512.png"), i512);
  console.log("wrote icon-192/512.png");
})();
