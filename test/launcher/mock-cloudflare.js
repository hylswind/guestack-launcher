// Dev-only mock of the Cloudflare API surface the launcher uses, plus the deployments it creates.
//
//   /client/v4/...           projects, deployments, domains, alerting policies and history,
//                            with Cloudflare's { success, errors, result } envelope
//   /preview/<project>/<id>  a deployment: the functions project answers /v1/issue with
//                            400 bad_envelope; the page project serves the files it was deployed with
//   /custom/v1/issue         stands in for the custom host (400 bad_envelope)
//   /__secrets, /__deploy    called by the wrangler shim (test/launcher/bin/wrangler)
//   /__state, /__scenario    inspection and failure injection for the tests
//
// A deployment appends "started" and "success" entries to the notification history for every
// enabled pages_event_alert policy whose filters name the project.
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";

const hex = (n) => randomBytes(n).toString("hex");

export async function startMockCloudflare({ token, accountId, functionsProject, pageProject }) {
  const state = {
    projects: {}, // name → { id, name, production_branch, deployments: [ { id, url, files } ] }
    secrets: {}, // project → { NAME: value }
    policies: [], // { id, name, alert_type, enabled, filters, mechanisms, modified }
    history: [], // { id, policy_id, alert_type, alert_body, sent, visibleAt }
    domains: {}, // project → [name]
    calls: [], // "METHOD /path" in order (API only)
    deployOrder: [], // project names in deployment order
    scenario: {},
  };
  let base = "";

  const envelope = (res, status, result, errors = []) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: status < 400, errors, messages: [], result }));
  };
  const json = (res, status, obj) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  function addProject(name) {
    state.projects[name] = { id: randomUUID(), name, production_branch: "main", deployments: [] };
    return state.projects[name];
  }

  function recordDeployment(project, files) {
    const p = state.projects[project];
    const id = randomUUID();
    const dep = { id, url: `${base}/preview/${project}/${id}`, files, environment: "production" };
    p.deployments.unshift(dep);
    state.deployOrder.push(project);
    const now = Date.now();
    const skipHistory = state.scenario.historyMissing === project;
    for (const policy of state.policies) {
      if (!policy.enabled || policy.alert_type !== "pages_event_alert") continue;
      if (!(policy.filters?.project_id || []).includes(p.id) || skipHistory) continue;
      for (const event of ["EVENT_DEPLOYMENT_STARTED", "EVENT_DEPLOYMENT_SUCCESS"]) {
        state.history.unshift({
          id: hex(16),
          policy_id: policy.id,
          alert_type: "pages_event_alert",
          mechanism: "ops@example.test",
          mechanism_type: "email",
          sent: new Date(now).toISOString(),
          alert_body: JSON.stringify({ data: { event, project_name: project, deployment_id: id } }),
          visibleAt: now + (state.scenario.historyDelayMs || 0),
        });
      }
    }
    if (state.scenario.foreignDeployment && project === pageProject) {
      const own = state.policies.find((pol) => pol.enabled);
      state.history.unshift({ id: hex(16), policy_id: own?.id, alert_type: "pages_event_alert",
        alert_body: JSON.stringify({ data: { project_name: project, deployment_id: randomUUID() } }),
        sent: new Date(now).toISOString(), visibleAt: now });
    }
    return dep;
  }

  async function readBody(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://mock");
    const path = url.pathname;
    const body = await readBody(req);

    // ---- control endpoints
    if (path === "/__scenario" && req.method === "POST") {
      Object.assign(state.scenario, body);
      if (body.priorDeployment) {
        const p = state.projects[body.priorDeployment] || addProject(body.priorDeployment);
        p.deployments.push({ id: randomUUID(), url: `${base}/old`, files: {} });
      }
      if (body.extraPolicy) {
        state.policies.push({ id: hex(16), name: "someone else", alert_type: "billing_usage_alert", enabled: true, modified: new Date().toISOString() });
      }
      return json(res, 200, { ok: true });
    }
    if (path === "/__state") return json(res, 200, state);
    if (path === "/__secrets" && req.method === "POST") {
      if (!state.projects[body.project]) return json(res, 404, { error: "no such project" });
      (state.secrets[body.project] ||= {})[body.name] = body.value;
      return json(res, 200, { ok: true });
    }
    if (path === "/__deploy" && req.method === "POST") {
      if (!state.projects[body.project]) return json(res, 404, { error: "no such project" });
      const dep = recordDeployment(body.project, body.files);
      return json(res, 200, { id: dep.id, url: dep.url });
    }

    // ---- deployed sites
    const preview = path.match(/^\/preview\/([^/]+)\/([^/]+)(\/.*)?$/);
    if (preview) {
      const [, project, id, rest = "/"] = preview;
      const dep = state.projects[project]?.deployments.find((d) => d.id === id);
      if (!dep) return json(res, 404, { error: "no deployment" });
      if (project === functionsProject) {
        if (rest === "/v1/issue" && req.method === "POST") {
          return state.scenario.brokenSmoke ? json(res, 503, { error: "integrity" }) : json(res, 400, { error: "bad_envelope" });
        }
        return json(res, 404, {});
      }
      const file = rest === "/" ? "index.html" : rest.slice(1);
      if (dep.files[file] === undefined) return json(res, 404, {});
      res.writeHead(200, { "content-type": file.endsWith(".js") ? "text/javascript" : "text/html" });
      return res.end(dep.files[file]);
    }
    if (path === "/custom/v1/issue" && req.method === "POST") return json(res, 400, { error: "bad_envelope" });

    // ---- Cloudflare API
    if (!path.startsWith("/client/v4/")) return json(res, 404, {});
    state.calls.push(`${req.method} ${path.slice("/client/v4".length)}`);
    if (req.headers.authorization !== `Bearer ${token}`) return envelope(res, 403, null, [{ code: 10000, message: "Authentication error" }]);
    if ((state.scenario.flaky5xx || 0) > 0) {
      state.scenario.flaky5xx -= 1;
      return envelope(res, 502, null, [{ code: 1, message: "bad gateway" }]);
    }
    const api = path.slice("/client/v4".length);
    const acct = `/accounts/${accountId}`;
    if (!api.startsWith(acct)) return envelope(res, 403, null, [{ code: 9109, message: "wrong account" }]);
    const r = api.slice(acct.length);
    let m;

    if ((m = r.match(/^\/pages\/projects\/([^/]+)$/)) && req.method === "GET") {
      const p = state.projects[m[1]];
      if (!p) return envelope(res, 404, null, [{ code: 8000007, message: "Project not found" }]);
      return envelope(res, 200, { id: p.id, name: p.name, production_branch: p.production_branch });
    }
    if (r === "/pages/projects" && req.method === "POST") {
      if (state.projects[body.name]) return envelope(res, 409, null, [{ code: 8000002, message: "exists" }]);
      const p = addProject(body.name);
      p.production_branch = body.production_branch;
      return envelope(res, 200, { id: p.id, name: p.name, production_branch: p.production_branch });
    }
    if ((m = r.match(/^\/pages\/projects\/([^/]+)\/deployments$/)) && req.method === "GET") {
      const p = state.projects[m[1]];
      if (!p) return envelope(res, 404, null, [{ code: 8000007, message: "Project not found" }]);
      return envelope(res, 200, p.deployments.map(({ id, url, environment }) => ({ id, url, environment, project_name: p.name })));
    }
    if ((m = r.match(/^\/pages\/projects\/([^/]+)\/domains$/)) && req.method === "POST") {
      if (state.scenario.domainFails) return envelope(res, 400, null, [{ code: 8000018, message: "invalid domain" }]);
      (state.domains[m[1]] ||= []).push(body.name);
      return envelope(res, 200, { name: body.name, status: "pending" });
    }
    if (r === "/alerting/v3/policies" && req.method === "GET") {
      // An extra enabled policy can appear after the launcher created its own.
      if (state.scenario.extraPolicyLater && state.history.length > 0 && !state.extraAdded) {
        state.extraAdded = true;
        state.policies.push({ id: hex(16), name: "late", alert_type: "pages_event_alert", enabled: true, modified: new Date().toISOString() });
      }
      return envelope(res, 200, state.policies);
    }
    if (r === "/alerting/v3/policies" && req.method === "POST") {
      // The real API refuses a pages_event_alert policy without environment and event filters.
      const f = body.filters || {};
      if (!f.project_id?.length || !f.environment?.length || !f.event?.length) {
        return envelope(res, 400, null, [{ code: 17103, message: "Error 17103: Filters selection must be provided to create a policy." }]);
      }
      const policy = { id: hex(16), ...body, created: new Date().toISOString(), modified: new Date().toISOString() };
      state.policies.push(policy);
      return envelope(res, 200, { id: policy.id });
    }
    if ((m = r.match(/^\/alerting\/v3\/policies\/([^/]+)$/)) && req.method === "GET") {
      const policy = state.policies.find((p) => p.id === m[1]);
      return policy ? envelope(res, 200, policy) : envelope(res, 404, null, [{ code: 17101, message: "not found" }]);
    }
    if (r === "/alerting/v3/history" && req.method === "GET") {
      const visible = state.history.filter((h) => h.visibleAt <= Date.now()).map(({ visibleAt, ...h }) => h);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ success: true, errors: [], messages: [], result: visible,
        result_info: { page: 1, per_page: 100, count: visible.length, total_count: visible.length } }));
    }
    return envelope(res, 404, null, [{ code: 7003, message: `no route ${req.method} ${r}` }]);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    apiBase: `${base}/client/v4`,
    state: () => state,
    scenario: (s) => Object.assign(state.scenario, s),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
