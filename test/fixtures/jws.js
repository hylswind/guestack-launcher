// [generated] by test/fixtures/gen-jws.mjs. Test-only keys and signatures made with
// node:crypto, independent of the WebCrypto code under test. Regenerate rather than edit.

export const PAYLOAD = {"iss":"https://issuer.test","sub":"1","n":42};

export const JWKS = {
  "main": {
    "keys": [
      {
        "kty": "RSA",
        "n": "0G37J1mNMl17uTT7-sN16IJWVS9pEnyuRa5x_GTvdsYyXhT663UpIWK2J4LHSK2PfvoWS5E6FfmvaTW_-I6Ht6hOUEmVXQXQ-jQbE6jqm2EZ4kGRc8TSv7eA2fzL2zjAJ-YVQzjL_s8qQIjbvE9mbT61pbnXEIsPlXeyMUtebOpzNsld9QL0ejYTDZ_qMCfGcjyrZTIgzBT1lkyVXOGPzWhgIDBVIUMBHnSAlQAgD1BRTGJp_zISpd6_z44ofXg45wR6g8094eYf69DnohrXKm5s_DAKNgWwHgdDL5irvYYiOAU-vBDD3D2VO4eJG9DZ9sdXz8ihPXk2vDA6qJmNdQ",
        "e": "AQAB",
        "kid": "rsa-a",
        "use": "sig",
        "alg": "RS256"
      },
      {
        "kty": "EC",
        "x": "Oatvjv5LFehynpgyssxe78OZ7q1m8cGy3AkLWY_FnV4",
        "y": "RkqNWzmRGBPfyWe63qqJSNNExBth_RF-PNkBkFcaHog",
        "crv": "P-256",
        "kid": "ec-1"
      },
      {
        "kty": "RSA",
        "n": "vymanpQpQJareTIfutDjcQNCkNY8jeGoRz-vZCiKXIGy6i4QHGbD7mdEQGkXC80-hTAxlY0ZIjefX8U9wc0hFh7hh-LtpoCF8C5hSdDlm0Db67DfAEAFRzt6tHUSFTeKmgEgMwFgP9hMmmly1K-yNVx4GKwE5_aC2DJq848fGO8",
        "e": "AQAB",
        "kid": "rsa-small"
      },
      {
        "kty": "EC",
        "x": "Oatvjv5LFehynpgyssxe78OZ7q1m8cGy3AkLWY_FnV4",
        "y": "RkqNWzmRGBPfyWe63qqJSNNExBth_RF-PNkBkFcaHog",
        "crv": "P-256",
        "kid": "ec-enc",
        "use": "enc"
      }
    ]
  },
  "single": {
    "keys": [
      {
        "kty": "RSA",
        "n": "0G37J1mNMl17uTT7-sN16IJWVS9pEnyuRa5x_GTvdsYyXhT663UpIWK2J4LHSK2PfvoWS5E6FfmvaTW_-I6Ht6hOUEmVXQXQ-jQbE6jqm2EZ4kGRc8TSv7eA2fzL2zjAJ-YVQzjL_s8qQIjbvE9mbT61pbnXEIsPlXeyMUtebOpzNsld9QL0ejYTDZ_qMCfGcjyrZTIgzBT1lkyVXOGPzWhgIDBVIUMBHnSAlQAgD1BRTGJp_zISpd6_z44ofXg45wR6g8094eYf69DnohrXKm5s_DAKNgWwHgdDL5irvYYiOAU-vBDD3D2VO4eJG9DZ9sdXz8ihPXk2vDA6qJmNdQ",
        "e": "AQAB"
      }
    ]
  },
  "ambiguous": {
    "keys": [
      {
        "kty": "RSA",
        "n": "0G37J1mNMl17uTT7-sN16IJWVS9pEnyuRa5x_GTvdsYyXhT663UpIWK2J4LHSK2PfvoWS5E6FfmvaTW_-I6Ht6hOUEmVXQXQ-jQbE6jqm2EZ4kGRc8TSv7eA2fzL2zjAJ-YVQzjL_s8qQIjbvE9mbT61pbnXEIsPlXeyMUtebOpzNsld9QL0ejYTDZ_qMCfGcjyrZTIgzBT1lkyVXOGPzWhgIDBVIUMBHnSAlQAgD1BRTGJp_zISpd6_z44ofXg45wR6g8094eYf69DnohrXKm5s_DAKNgWwHgdDL5irvYYiOAU-vBDD3D2VO4eJG9DZ9sdXz8ihPXk2vDA6qJmNdQ",
        "e": "AQAB"
      },
      {
        "kty": "RSA",
        "n": "4JaInfueaXMtdtfiq36iPcHXxpTTdRgnqAxr4KPRUztgUQPNQeAiJ20rwXEKcxSXD3qGYjgB6RpDAOBpyLxkwSPhalwhuCIk54_t7ci28_iDLqh1Cyxh0tEunRSdByzWRo3eKcLyG2_yfmy6EgQEPSLw0nDTJCtj43BIHoV2buaMEh3-UIGaolX-oa6vARsUyszpSlfdwyEvcK0L62yb_OzyM868Vw47A8r6DzHzP6kjLnINnvqRgob10S50pe7uDVn332xYIPaJFTxK7W3pwVqeIikXwBQWjbnhZ7zyGDukMZOpE5J5zX70YPOArjoyh3kx75Xo0uiho7X-xuf-5Q",
        "e": "AQAB"
      }
    ]
  },
  "padded": {
    "keys": [
      {
        "kty": "RSA",
        "kid": "rsa-a",
        "n": "AADQbfsnWY0yXXu5NPv6w3XoglZVL2kSfK5FrnH8ZO92xjJeFPrrdSkhYrYngsdIrY9--hZLkToV-a9pNb_4joe3qE5QSZVdBdD6NBsTqOqbYRniQZFzxNK_t4DZ_MvbOMAn5hVDOMv-zypAiNu8T2ZtPrWludcQiw-Vd7IxS15s6nM2yV31AvR6NhMNn-owJ8ZyPKtlMiDMFPWWTJVc4Y_NaGAgMFUhQwEedICVACAPUFFMYmn_MhKl3r_Pjih9eDjnBHqDzT3h5h_r0OeiGtcqbmz8MAo2BbAeB0MvmKu9hiI4BT68EMPcPZU7h4kb0Nn2x1fPyKE9eTa8MDqomY11",
        "e": "AQAB"
      }
    ]
  },
  "empty": {
    "keys": []
  }
};

export const VECTORS = [
  {
    "name": "valid RS256",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.P06Wj7GSiFcGOXTnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCg",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": true
  },
  {
    "name": "valid ES256",
    "jws": "eyJhbGciOiJFUzI1NiIsImtpZCI6ImVjLTEifQ.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.RBSYk2EYO6uNJyqbYh6HLS1xjS4XkwVjvS74CA0tDxePPiTF1jZNhecplC9l1u1FrMIZDsVzmu79eGyyLIuCRA",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": true
  },
  {
    "name": "RS256 without kid, one compatible key",
    "jws": "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.QDtr2CPo3It76e10s7PRJQ53MyDpoBlGYN_mlAsftWyPcLgGK2TD3nWninYMCmt1qxpRc8UoaYydbICfrAY8WLh1CYhW-eFXtESMYuufMXjBbChE0yaeZbH_6G-pY00W2-H2SEPJFF2P0nvxShg5DbXbBUyIAh7KnmSzn80H-NXKg54IpnX7Qf820BFNgISYTeaKROFeXP4ndHUr9tUa3x__0l-pQdv7-gPjNGCnPZ2ln-nUFTXjnIkneh6jysEO_MWiSzRvw1UMZjC63oe6yFC4ZkqRRTtC_z7DsoOn6wYy4c6_CJfLDS_Bt8Sp4UxwjUOpbd5zX0hcvlnDOfmuEA",
    "jwks": "single",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": true
  },
  {
    "name": "modulus with leading zero bytes",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.cmGsWSbXLRaQFhCBIX1z4EWCdYoxjyccPtBFLyYMqcrGiCVjUuOV2FLTX2wBV48TZIeLxj2qdGEPkQT9_q9Ac0WNXT3PSSYn0iIvmqkXVUQ04kFk9lTkPTQtq7U-74dvmptS2heSyiitKsYgzK9qljk0I0guMERO75n2-OfgxvIIjwp_RzejfNDFk4BYG8892Toos5j7eHBm2se6QuiDr0Q9yU1KpVbJU9MJ31gIf6S1HJ3PcWElSr6JiVFFd4iNdwf30TkX4pCZbrUL-smgn-v2yGjr26S1QGebyGc6UDjdt0gekd3alzwqx_JHTD_KtBulKhh6027FGUftLg45Gg",
    "jwks": "padded",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": true
  },
  {
    "name": "alg none with empty signature",
    "jws": "eyJhbGciOiJub25lIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "malformed"
  },
  {
    "name": "alg none with a signature",
    "jws": "eyJhbGciOiJub25lIiwia2lkIjoicnNhLWEifQ.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.P06Wj7GSiFcGOXTnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCg",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "alg"
  },
  {
    "name": "HS256 keyed with the RSA public key",
    "jws": "eyJhbGciOiJIUzI1NiIsImtpZCI6InJzYS1hIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.9MQjK1j2qUbPdUU_JAxDu3muV3PN-r_cPGAZBRPcVzI",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "alg"
  },
  {
    "name": "ES256 not in the caller's allow-list",
    "jws": "eyJhbGciOiJFUzI1NiIsImtpZCI6ImVjLTEifQ.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.04YEPnfJvmuHBupmaI9FFqR_uPQan4fmpPhbhHyTH0-22FGYXJDC_r0Rx_A6WWZtPgO__sgpy5HKtuVOYQ1jlg",
    "jwks": "main",
    "algs": [
      "RS256"
    ],
    "ok": false,
    "reason": "alg"
  },
  {
    "name": "crit header",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwiY3JpdCI6WyJleHAiXX0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.e2IWOXCgIYRxRGoIHCqchV_br0nX7ZyX2LL_XyAWLCcu_BCcGI3FI9e4FuUvHbw7YfOF5ZQFvRu7wa21k2vz06PqOdAeYQmKgq7mYEAmSb6u5HgpM4FbpBpAcqtGLgRYI9Jem1u2F56P4ka_jB4Qanj0b11-dnsVa_NbbeGuXFGtFmo_KMK6aDgV4tddkXXmiyIjWuj8fYxeccveUMXEhSXskDvWbuBS8I8S-zzVt6vFX7xu-S-23OZZcBhcecORiXVYLAJqfGzuzIA6qSmgaZn7QAIREvBZ33gpcGUn_Fi4pzfC-1wm8LYPMAC3kiasdG0Kk3RyjLPugwONGjS4fw",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "crit"
  },
  {
    "name": "non-string kid",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6N30.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.JpStK6CjevU3kttH_X2rX5Nz8RMyngCkNGoCGrXk-PcGon550Xo2zmakSzOEWO_x4hRJ1358BWAsKh2wFMa739nIBBr920cR4bUqHgBBAC16ibV0IjHZFCWfyV8B-TQfJforf0zZPstmJqnqxHujdXTapsZdYlSibE5bprIzkSZWJdMJW3OJya-YxiX5uXIyHv8BfDPbJpc1QxgGpmCvlwr4G4u-xipZCai1cMVrSOFGuhFzhYudtm9Pc2Di92lZxdAETpcxGwx-HolZJdx19QRx--lkHqE40m4ZhdpGQsmUc_VtXfz5uOlHlrSxWWcAJrQ6PH1R68lY_S1BSTXI1w",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "kid"
  },
  {
    "name": "unknown kid",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6Im5vcGUifQ.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.tNpOs2S8M69uyH6KLkSnSYWmsXRO8-pgs17gau3UCNQnF2lVIi21hoN73tGqO-Xcdx5EfVlDM7kIHmWYDgfPtbDhBCuMwxwCb9tL-8jj-lcCk7wxwQFlX2dm89wJbs1hmEV5cF7rwQ6iQ_0pFvg1iKT6dZwc9DYsxIIhWeeJx4IV5Z33pV08sVgsB9_ccq6ogRUaBJlhRxEMVsTKqR3ClAZT_-VzcTgPw5zi2ezsOO71xmdlhc1ITNjXhHGfhee5eQNGbCESdh3R2KqAf8TqZDnHVD_X_zjSsG64G1RU0kcUpxTUah-z87XekvEmKdfR7WCcfuzLxTUZevsFVd-brQ",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "unknown_kid"
  },
  {
    "name": "no kid, two compatible keys",
    "jws": "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.QDtr2CPo3It76e10s7PRJQ53MyDpoBlGYN_mlAsftWyPcLgGK2TD3nWninYMCmt1qxpRc8UoaYydbICfrAY8WLh1CYhW-eFXtESMYuufMXjBbChE0yaeZbH_6G-pY00W2-H2SEPJFF2P0nvxShg5DbXbBUyIAh7KnmSzn80H-NXKg54IpnX7Qf820BFNgISYTeaKROFeXP4ndHUr9tUa3x__0l-pQdv7-gPjNGCnPZ2ln-nUFTXjnIkneh6jysEO_MWiSzRvw1UMZjC63oe6yFC4ZkqRRTtC_z7DsoOn6wYy4c6_CJfLDS_Bt8Sp4UxwjUOpbd5zX0hcvlnDOfmuEA",
    "jwks": "ambiguous",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "kid"
  },
  {
    "name": "no kid, no keys",
    "jws": "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.QDtr2CPo3It76e10s7PRJQ53MyDpoBlGYN_mlAsftWyPcLgGK2TD3nWninYMCmt1qxpRc8UoaYydbICfrAY8WLh1CYhW-eFXtESMYuufMXjBbChE0yaeZbH_6G-pY00W2-H2SEPJFF2P0nvxShg5DbXbBUyIAh7KnmSzn80H-NXKg54IpnX7Qf820BFNgISYTeaKROFeXP4ndHUr9tUa3x__0l-pQdv7-gPjNGCnPZ2ln-nUFTXjnIkneh6jysEO_MWiSzRvw1UMZjC63oe6yFC4ZkqRRTtC_z7DsoOn6wYy4c6_CJfLDS_Bt8Sp4UxwjUOpbd5zX0hcvlnDOfmuEA",
    "jwks": "empty",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "kid"
  },
  {
    "name": "RS256 header pointing at the EC key",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6ImVjLTEifQ.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.DLeaJ8FSYRUIqt0CT2qOnzgujzcd3PO-2getVAsVd2labndUkVfzPstoHKkxRgagfJ0Cbu59I3RLgS5sIO8rFq9QumJDFgI1H3F7cy1182huVCqXoEJCTb4JqO1pNttO5Y0eUvvVCkgOgfjkp8rOKWZunHQDmnm3nHOYhD6q01sDWzCEzmVfP_7wiVp7ogh8YS3BRT4iwtpBnSesEDRVYNHR0DbcCdYgo9iuNhRgHWDCJIWVS2IpqPNqZlV8XrzvEWKUBBIYYcJur3MXKoSIECh_tqUD3Q5glWgv5N3mLkOGCobabwY4l_NBNKn2r-Ma1I_13pBxeZ_3fWVgJafVJA",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "key_mismatch"
  },
  {
    "name": "RS256 with a 1024-bit key",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1zbWFsbCJ9.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.TaOLcULfp27GXbAHyV5QM1Xni8i5LpE8T0VDvvO3_UD5CwO-IwsJmFGnog0XYmdlUuuC7oySe0WC81T2Iw28yT1l4-2K4JJ3WdH6lvzOdl-d1CD-DDSx-GBXinRmPmpSn_42J1cXqEd3Q58UCWi5t25L5Ek6vVMNOKTIrI3lTqA",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "key_mismatch"
  },
  {
    "name": "key marked use=enc",
    "jws": "eyJhbGciOiJFUzI1NiIsImtpZCI6ImVjLWVuYyJ9.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.2rT1JA6OMHTxrdEs45Z4JS206lfDwAjG4pjUU4G7LVM8EAwCj1yKCmGaeJ-caLf3ij68qU48TVTCos0WVG_5LQ",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "key_mismatch"
  },
  {
    "name": "ES256 with a DER signature",
    "jws": "eyJhbGciOiJFUzI1NiIsImtpZCI6ImVjLTEifQ.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.MEYCIQCLQRVnuNTqCpU5KgPIhqoSsTI78Wqoqqz4j_vEf7ZgMgIhALekENA3Kv4m-GTZzdCwkTdwxqp0Jix728l2OynqHnpm",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "signature_length"
  },
  {
    "name": "RS256 truncated signature",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.TpaPsZKIVwY5ded8dxspvVEiUltCTG9pD9XLpNvao52FqCBqkr8eWtrQd0MuEQ9QJ69gurBKI_tVskE_3isqwqH_qkBAw1qabcMWh8QQacj8jVutXOhx4FEAth9I8G0Zx40a3Hft6Vjb7i_orP70ex4siMqn8A28mha4Y_K50yNCURwVEgvNqYivj3GIRMM-oqO3Lz1_TinsIUwMRjJQbEhCzQBA4n0pTQvUTejm3nm_fsDtUpLH3v0v8OMUOwa61kqf25mDex2qVrp41hOdwOyiEpDMIdX6rrYBWiQUHKqJSfGgnyennz-3tu5a9CHlGcQQSgg0-wWXNQOhk58K",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "signature_length"
  },
  {
    "name": "tampered payload",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQzfQ.P06Wj7GSiFcGOXTnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCg",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "signature"
  },
  {
    "name": "tampered signature",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.P06Wj7GSiFcGOXXnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCg",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "signature"
  },
  {
    "name": "signed by another key under the same kid",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.IdW2okJxfw-6q-W1Om0ZpjfPZYCYZ6GQk4srQ4xDKThl2KlFvKKh-sHA3laYH83mCi2Ct7HupkHGfPhXbkwemNBOG8qt8O3DD59xNhx0WuORCaU6vUJcEZXU7pqu5P7br-qEhRT0D1FNDpKd3oVIFk8TB2XA5eCGWtDyYses52-U2itRt6O0bK0p-OeByNrGiaWZcoslgojF4ekgP7lOX-nUZDMRuG6xzZz2Z2f05LHkZJoj5M2WOTOSFADa0AQFTbwRsaHx3JhTOPIo2nbvJSOGjHYxv9dOSFF1JZCe1X08a0pEwGkxcsx9mb7fR_Mfw6ACDZDp0dVOh-yIzTIevA",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "signature"
  },
  {
    "name": "two segments",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "malformed"
  },
  {
    "name": "four segments",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.P06Wj7GSiFcGOXTnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCg.x",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "malformed"
  },
  {
    "name": "header is not JSON",
    "jws": "bm90IGpzb24.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.P06Wj7GSiFcGOXTnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCg",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "malformed"
  },
  {
    "name": "payload is a JSON array",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.WzFd.P06Wj7GSiFcGOXTnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCg",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "malformed"
  },
  {
    "name": "non-canonical base64url in the signature",
    "jws": "eyJhbGciOiJSUzI1NiIsImtpZCI6InJzYS1hIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL2lzc3Vlci50ZXN0Iiwic3ViIjoiMSIsIm4iOjQyfQ.P06Wj7GSiFcGOXTnfHcbKb1RIlJbQkxvaQ_Vy6Tb2qOdhaggapK_Hlra0HdDLhEPUCevYLqwSiP7VbJBP94rKsKh_6pAQMNamm3DFofEEGnI_I1brVzoceBRALYfSPBtGceNGtx37elY2-4v6Kz-9HseLIjKp_ANvJoWuGPyudMjQlEcFRILzamIr49xiETDPqKjty89f04p7CFMDEYyUGxIQs0AQOJ9KU0L1E3o5t55v37A7VKSx979L_DjFDsGutZKn9uZg3sdqla6eNYTncDsohKQzCHV-q62AVokFByqiUnxoJ8np58_t7buWvQh5RnEEEoINPsFlzUDoZOfCA=",
    "jwks": "main",
    "algs": [
      "RS256",
      "ES256"
    ],
    "ok": false,
    "reason": "malformed"
  }
];
