import assert from "node:assert/strict";
import test from "node:test";
import { eta, pct, size, torrentName, torrentView } from "../src/lib/format.mjs";

test("size formats bytes with binary units", () => {
  assert.equal(size(0), "?");
  assert.equal(size(512), "512B");
  assert.equal(size(1024), "1K");
  assert.equal(size(1024 ** 2), "1.00M");
  assert.equal(size(2.5 * 1024 ** 3), "2.50G");
});

test("pct and eta handle empty or unknown values", () => {
  assert.equal(pct(50, 200), 25);
  assert.equal(pct(0, 0), 0);
  assert.equal(eta(0), "-");
  assert.equal(eta(59), "0m59s");
  assert.equal(eta(3725), "1h2m");
});

test("torrentName prefers the bittorrent display name", () => {
  assert.equal(torrentName({ gid: "x", bittorrent: { info: { name: "Ubuntu" } } }), "Ubuntu");
  assert.equal(torrentName({ gid: "x", files: [{ path: "/dir/file.mkv" }] }), "dir");
  assert.equal(torrentName({ gid: "x" }), "x");
});

test("torrentView normalises aria2 output", () => {
  const view = torrentView({
    gid: "abc",
    status: "active",
    totalLength: "1000",
    completedLength: "250",
    downloadSpeed: "2048",
    eta: "60",
    numSeeders: "3",
    files: [{ path: "a/b.mkv" }],
  });
  assert.equal(view.percent, 25);
  assert.equal(view.name, "a");
  assert.equal(view.done, 250);
  assert.equal(view.seeders, "3");
  assert.equal(view.eta, "1m00s");
});
