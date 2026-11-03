// Published test vectors, cross-checked once against node:crypto.

const seq = (start, n) => Array.from({ length: n }, (_, i) => (start + i).toString(16).padStart(2, "0")).join("");
const rep = (byteHex, n) => byteHex.repeat(n);
const txt = (s) => Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

// FIPS 180-4 examples.
export const SHA256 = [
  { msg: "", hex: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { msg: "abc", hex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
];

// RFC 4231 HMAC-SHA256 test cases 1–7 (case 5 is truncated to 128 bits).
export const RFC4231 = [
  { n: 1, key: rep("0b", 20), data: txt("Hi There"),
    mac: "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7" },
  { n: 2, key: txt("Jefe"), data: txt("what do ya want for nothing?"),
    mac: "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843" },
  { n: 3, key: rep("aa", 20), data: rep("dd", 50),
    mac: "773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe" },
  { n: 4, key: seq(1, 25), data: rep("cd", 50),
    mac: "82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b" },
  { n: 5, key: rep("0c", 20), data: txt("Test With Truncation"), truncate: 16,
    mac: "a3b6167473100ee06e0c796c2955552b" },
  { n: 6, key: rep("aa", 131), data: txt("Test Using Larger Than Block-Size Key - Hash Key First"),
    mac: "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54" },
  { n: 7, key: rep("aa", 131),
    data: txt("This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm."),
    mac: "9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2" },
];

// RFC 5869 Appendix A, SHA-256 test cases 1–3.
export const RFC5869 = [
  { n: 1, ikm: rep("0b", 22), salt: seq(0x00, 13), info: seq(0xf0, 10), L: 42,
    okm: "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865" },
  { n: 2, ikm: seq(0x00, 80), salt: seq(0x60, 80), info: seq(0xb0, 80), L: 82,
    okm: "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71cc30c58179ec3e87c14c01d5c1f3434f1d87" },
  { n: 3, ikm: rep("0b", 22), salt: "", info: "", L: 42,
    okm: "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8" },
];

// RFC 7636 Appendix B.
export const RFC7636 = {
  verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
};

// RFC 4648 §10 (as base64url without padding) and RFC 7515 Appendix C.
export const B64URL = [
  { text: "", b64: "" },
  { text: "f", b64: "Zg" },
  { text: "fo", b64: "Zm8" },
  { text: "foo", b64: "Zm9v" },
  { text: "foob", b64: "Zm9vYg" },
  { text: "fooba", b64: "Zm9vYmE" },
  { text: "foobar", b64: "Zm9vYmFy" },
];
export const B64URL_BYTES = [
  { bytes: [3, 236, 255, 224, 193], b64: "A-z_4ME" },
  { bytes: [0xfb, 0xff], b64: "-_8" },
  { bytes: [0], b64: "AA" },
  { bytes: [0, 0, 0], b64: "AAAA" },
  { bytes: [0xff, 0xff, 0xff], b64: "____" },
];
