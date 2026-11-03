// Dev-only throwaway relying party for the E2E tier. Not shipped.
//
//   /              login link to the page: PAGE_URL?session=<random>&return=/done?from=rp
//   /no-referrer   the same, served with Referrer-Policy: no-referrer
//   /done          reads #gs_jwt / #gs_error, strips the fragment with history.replaceState,
//                  and shows the value in #result (data-state = jwt | error | none)
//
// The RP sends no Referrer-Policy of its own on "/", so the browser default
// (strict-origin-when-cross-origin) gives the page the RP's origin as document.referrer.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const DONE = `<!doctype html><title>RP done</title><p id="result" data-state="pending"></p>
<script>
  const fragment = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search);
  const result = document.getElementById("result");
  if (fragment.has("gs_jwt")) { result.dataset.state = "jwt"; result.textContent = fragment.get("gs_jwt"); }
  else if (fragment.has("gs_error")) { result.dataset.state = "error"; result.textContent = fragment.get("gs_error"); }
  else result.dataset.state = "none";
</script>`;

export async function startRp({ port, pageOrigin }) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://rp");
    const html = (status, body, headers = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...headers });
      res.end(body);
    };
    if (url.pathname === "/" || url.pathname === "/no-referrer") {
      const session = randomBytes(12).toString("base64url");
      const href = `${pageOrigin}?session=${session}&return=${encodeURIComponent("/done?from=rp")}`;
      const headers = url.pathname === "/no-referrer" ? { "referrer-policy": "no-referrer" } : {};
      return html(200, `<!doctype html><title>RP</title><p id="session">${session}</p>`
        + `<a id="login" href="${escapeHtml(href)}">Log in with Guestack</a>`, headers);
    }
    if (url.pathname === "/done") return html(200, DONE);
    html(404, "not found");
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { close: () => new Promise((resolve) => server.close(resolve)) };
}
