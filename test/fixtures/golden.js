// Golden values computed once with node:crypto only (createHmac, hkdfSync, diffieHellman,
// createCipheriv), i.e. independently of functions-project/lib and of WebCrypto. They pin the
// [const] derivations and detect drift between the three test runtimes. Keys: fixtures/keys.js.

// RFC 7638 thumbprint of JWT_KEY.
export const JWT_KEY_THUMBPRINT = "S8CMdaLiK_AbbJYw9mT_jdomNClJqdxGrx6LKSIboNo";

// ids.js: K_UNIVERSAL = 0x11 × 32, K_PER_RP = 0x22 × 32, phone "+14155552671".
export const K_UNIVERSAL_HEX = "11".repeat(32);
export const K_PER_RP_HEX = "22".repeat(32);
export const PHONE = "+14155552671";
export const UID_HEX = "c4ca0dd4f3c0d4d4fc88ad60c085b922d4a4a59b3f9b2f7c86b0ff29b2358361";
export const PER_RP_HEX = {
  "https://a.com": "2f1988f85474826b7713d2d25b1cd4b1b63d716d4a6755930e12497a2ababfc8",
  "https://a.com:8443": "a200c8d36e757351ff4891f59c8a9420e6617aa9ae41036d98882716ea0a74f4",
  "https://b.com": "e7ddfbfce7daf4fd998a2c97c4e4694a3308acb5cf1653ee179aca5985bf0fad",
};

// comm.js: client ephemeral EPHEMERAL_KEY × server COMM_KEY, iv = 00..0b, nonce = 0x42 × 16,
// request object { a: 1 } → plaintext {"a":1,"nonce":"…"}.
export const COMM = {
  ssHex: "fffbfae7b9d0bd31354d7f63ee4b5ec2542469783af08decd464c5f9baea8407",
  kReqHex: "c176b526b3e49789a5ef427096a7d51bf66525cf0e955a9c04b9699e6df9c40b",
  kResHex: "5c96043a36a5d0e31d7a8e49f2c7b0e0d46e8733b90fb94c613ce5850648a9c2",
  epk: "BIsZVF17EgvkEwhGTHv2h6d00rIReDlmAdBiAv9U7oTKFagtloYMMD72Yo1kMNCsO6fV9qFf4R5jsrrdPM4RpNc",
  ivHex: "000102030405060708090a0b",
  iv: "AAECAwQFBgcICQoL",
  nonce: "QkJCQkJCQkJCQkJCQkJCQg",
  ct: "FbKJ9_9vgOxydd4s8oBQYSHf9i9xiOGOkAUxAWe8wnqAlkS2E6F1ErqNg8L4Yu-kZM1JaYZjw0M",
};
