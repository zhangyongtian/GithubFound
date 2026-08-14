#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const ASSETS_DIR = path.join(ROOT, "assets");
const SRC_APP_DIR = path.join(ROOT, "src", "app");
const SRC_SVG = path.join(PUBLIC_DIR, "logo.svg");

const ICO_SIZES = [16, 24, 32, 48, 64, 256];
const PNG_SIZES = [
  { name: "apple-touch-icon.png", size: 180, pad: 20, bg: "#0D1117" },
  { name: "icon-192.png", size: 192, pad: 16, bg: "#0D1117" },
  { name: "icon-512.png", size: 512, pad: 48, bg: "#0D1117" },
];

function crc32(buf) {
  let table = (crc32.table ||= (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeIco(entries) {
  const count = entries.length;
  const dirSize = 6 + count * 16;
  const offsets = [];
  let offset = dirSize;
  for (const e of entries) {
    offsets.push(offset);
    offset += e.pngBuf.length;
  }
  const total = dirSize + entries.reduce((s, e) => s + e.pngBuf.length, 0);
  const out = Buffer.alloc(total);
  // ICONDIR
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  let p = 6;
  entries.forEach((e, i) => {
    out[p] = e.size === 256 ? 0 : e.size;
    out[p + 1] = e.size === 256 ? 0 : e.size;
    out[p + 2] = 0;
    out[p + 3] = 0;
    out.writeUInt16LE(1, p + 4);
    out.writeUInt16LE(32, p + 6);
    out.writeUInt32LE(e.pngBuf.length, p + 8);
    out.writeUInt32LE(offsets[i], p + 12);
    p += 16;
  });
  entries.forEach((e, i) => {
    e.pngBuf.copy(out, offsets[i]);
  });
  return out;
}

async function main() {
  for (const d of [PUBLIC_DIR, ASSETS_DIR, SRC_APP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  const svgBuf = fs.readFileSync(SRC_SVG);

  const icoEntries = [];
  for (const size of ICO_SIZES) {
    const pad = Math.max(1, Math.floor(size * 0.1));
    const inner = size - pad * 2;
    const raw = await sharp(svgBuf, { density: 4 * size })
      .resize(inner, inner, { fit: "inside", kernel: "lanczos3" })
      .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#0D1117" })
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    icoEntries.push({ size, pngBuf: raw });
  }
  const icoBuf = makeIco(icoEntries);
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.ico"), icoBuf);
  fs.writeFileSync(path.join(ASSETS_DIR, "favicon.ico"), icoBuf);
  fs.writeFileSync(path.join(SRC_APP_DIR, "favicon.ico"), icoBuf);

  for (const def of PNG_SIZES) {
    const inner = def.size - def.pad * 2;
    const buf = await sharp(svgBuf, { density: 4 * def.size })
      .resize(inner, inner, { fit: "inside", kernel: "lanczos3" })
      .extend({ top: def.pad, bottom: def.pad, left: def.pad, right: def.pad, background: def.bg })
      .png({ compressionLevel: 9 })
      .toBuffer();
    fs.writeFileSync(path.join(PUBLIC_DIR, def.name), buf);
    fs.writeFileSync(path.join(ASSETS_DIR, def.name), buf);
  }

  // Also copy logo.svg to assets (already done, ensure fresh)
  fs.copyFileSync(SRC_SVG, path.join(ASSETS_DIR, "logo.svg"));
  // favicon.svg public -> assets
  fs.copyFileSync(path.join(PUBLIC_DIR, "favicon.svg"), path.join(ASSETS_DIR, "favicon.svg"));

  console.log("Icons regenerated OK ->", JSON.stringify(ICO_SIZES), "ICO + PNGs");
}

main().catch((e) => { console.error(e); process.exit(1); });
