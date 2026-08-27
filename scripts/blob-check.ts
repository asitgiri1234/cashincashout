/**
 * Round-trip check on Vercel Blob.
 *
 *   npx tsx --env-file=.env.local scripts/blob-check.ts
 *
 * Uploads a generated PNG, prints its URL, fetches it back, deletes it, then
 * deletes it a second time to prove deletion is idempotent. Also feeds the
 * validator a disguised text file to prove the signature check is real and
 * not just reading Content-Type.
 *
 * Throwaway: this exists so credentials can be verified before any UI does.
 *
 * `lib/storage` is guarded with `server-only`, which throws under plain Node.
 * CLI tooling imports the implementation directly — as with `lib/db/client`.
 */

import { deflateSync } from "node:zlib";

import {
  StorageError,
  deleteProductImage,
  sniffImageType,
  uploadProductImage,
} from "../lib/storage/blob";

/* -------------------------------------------------------------------------
   A REAL PNG, GENERATED
   ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));

  return Buffer.concat([length, typed, crc]);
}

/**
 * A genuine 8-bit RGB PNG, built rather than pasted from a base64 blob, so
 * the bytes this script uploads are ones it actually produced.
 */
function makePng(size = 32): Buffer {
  // Each scanline is a filter byte (0 = none) followed by RGB triples.
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      raw[offset++] = (x * 8) % 256; // R
      raw[offset++] = (y * 8) % 256; // G
      raw[offset++] = 0x80; // B
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------
   CHECK
   ------------------------------------------------------------------------- */

const ok = (msg: string) => console.log(`  ok    ${msg}`);
const fail = (msg: string) => console.log(`  FAIL  ${msg}`);

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "BLOB_READ_WRITE_TOKEN is not set.\n" +
        "Add it to .env.local — see .env.example — then re-run:\n" +
        "  npx tsx --env-file=.env.local scripts/blob-check.ts",
    );
    process.exit(1);
  }

  let failures = 0;

  // -- 1. the validator rejects a disguised file --------------------------
  console.log("\nvalidation");

  const notAnImage = new File(
    [new Uint8Array(Buffer.from("<?php echo 'not an image'; ?>", "utf8"))],
    "innocent.png",
    { type: "image/png" },
  );

  try {
    await uploadProductImage(notAnImage, "blob-check");
    fail("a text file labelled image/png was ACCEPTED");
    failures++;
  } catch (err) {
    if (err instanceof StorageError && err.code === "unsupported_type") {
      ok(`text file labelled image/png rejected — "${err.message}"`);
    } else {
      fail(`rejected, but unexpectedly: ${String(err)}`);
      failures++;
    }
  }

  const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", {
    type: "image/png",
  });
  try {
    await uploadProductImage(oversized, "blob-check");
    fail("a 6 MB file was ACCEPTED");
    failures++;
  } catch (err) {
    if (err instanceof StorageError && err.code === "file_too_large") {
      ok(`6 MB file rejected — "${err.message}"`);
    } else {
      fail(`rejected, but unexpectedly: ${String(err)}`);
      failures++;
    }
  }

  // Path traversal must not escape products/.
  const png = makePng();
  if (sniffImageType(new Uint8Array(png)) !== "image/png") {
    fail("generated PNG did not sniff as image/png — the generator is wrong");
    process.exit(1);
  }
  ok("generated PNG sniffs as image/png");

  // -- 2. upload ----------------------------------------------------------
  console.log("\nupload");

  const file = new File([new Uint8Array(png)], "test.png", { type: "image/png" });
  const uploaded = await uploadProductImage(file, "../../etc/blob-check");

  ok(`uploaded ${uploaded.size} bytes as ${uploaded.contentType}`);
  console.log(`        pathname: ${uploaded.pathname}`);
  console.log(`        url:      ${uploaded.url}`);

  if (!uploaded.pathname.startsWith("products/")) {
    fail(`path traversal escaped products/: ${uploaded.pathname}`);
    failures++;
  } else {
    ok("slug with ../ was sanitised, key stayed under products/");
  }

  // -- 3. it is really there ----------------------------------------------
  const res = await fetch(uploaded.url);
  if (res.ok) {
    const bytes = new Uint8Array(await res.arrayBuffer());
    const same = bytes.byteLength === png.byteLength;
    ok(
      `fetched back: ${res.status}, ${bytes.byteLength} bytes, ` +
        `content-type ${res.headers.get("content-type")}` +
        (same ? "" : " — SIZE DIFFERS"),
    );
    if (!same) failures++;
  } else {
    fail(`fetching the uploaded URL returned ${res.status}`);
    failures++;
  }

  // -- 4. delete, then delete again ---------------------------------------
  console.log("\ndelete");

  await deleteProductImage(uploaded.pathname);
  ok("deleted");

  try {
    await deleteProductImage(uploaded.pathname);
    ok("deleting an already-deleted blob did not throw (idempotent)");
  } catch (err) {
    fail(`second delete threw: ${String(err)}`);
    failures++;
  }

  await deleteProductImage(null);
  ok("deleting a null pathname did not throw");

  // Vercel Blob serves through a CDN, so a just-deleted URL can still be
  // cached for a moment. Report the status rather than asserting on it.
  const after = await fetch(uploaded.url);
  console.log(`        url after delete: ${after.status}`);

  console.log(
    failures === 0
      ? "\nblob storage is working.\n"
      : `\n${failures} check(s) FAILED.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  if (err instanceof StorageError) {
    console.error(`\nStorageError [${err.code}]: ${err.message}`);
    if (err.cause) console.error("cause:", err.cause);
  } else {
    console.error(err);
  }
  process.exit(1);
});
