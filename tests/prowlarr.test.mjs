import assert from "node:assert/strict";
import test from "node:test";
import { magnetFor, resultView, shortMagnet } from "../src/lib/prowlarr.mjs";

test("magnetFor understands magnets, guids and info hashes", () => {
  assert.equal(magnetFor({ magnetUrl: "magnet:?xt=urn:btih:aa" }), "magnet:?xt=urn:btih:aa");
  assert.equal(magnetFor({ guid: "magnet:?xt=urn:btih:bb" }), "magnet:?xt=urn:btih:bb");
  const built = magnetFor({ infoHash: "cc", title: "Some Thing" });
  assert.match(built, /^magnet:\?xt=urn:btih:cc&dn=Some%20Thing&tr=/);
  assert.equal(magnetFor({ downloadUrl: "http://example/1.torrent" }), null);
});

test("shortMagnet drops bloated proxy links", () => {
  assert.equal(shortMagnet({ infoHash: "aa" }) !== null, true);
  assert.equal(shortMagnet({ magnetUrl: "magnet:?" + "x".repeat(500) }), null);
});

test("resultView exposes a compact, numbered shape", () => {
  const view = resultView(
    { title: "T", indexer: "I", size: 1024, seeders: 5, leechers: 1, categories: [{ name: "Movies" }], infoHash: "aa" },
    3,
  );
  assert.equal(view.pick, 3);
  assert.equal(view.category, "Movies");
  assert.ok(view.magnet.startsWith("magnet:"));
});
