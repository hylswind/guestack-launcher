// Wiring: builds the effects flow.js needs from the real browser and renders its views.
// All text is set with textContent; nothing is parsed as HTML.

import { call } from "./api.js";
import * as config from "./config.js";
import { run, startLogin } from "./flow.js";

const PRIVACY = "This site will receive a pseudonymous ID unique to it. Your phone number is never shared.";

const MESSAGES = {
  about: "Guestack signs you in to websites with a pseudonymous ID. Open it through a site's login button.",
  working: "Signing you in…",
  logged_in: "Logged in. Return to the site you came from.",
  relogin: "Please sign in again.",
  phone_unavailable: "That account has no verified phone number. Try the other provider.",
};

const ERRORS = {
  no_referrer: "The site that sent you here did not reveal its address, so Guestack cannot tell which site "
    + "to sign you in to. The site must send its origin as the referrer; go back and try its login button again.",
  bad_request: "This login link is malformed. Go back and use the site's login button again.",
  bad_state: "This sign-in could not be verified. Go back to the site and start again.",
  user_cancelled: "Sign-in was cancelled.",
  provider_error: "The sign-in provider reported an error. Go back to the site and try again.",
  unreachable: "Open this through the site's login button.",
  unavailable: "Guestack cannot complete this request right now. Try again later.",
  storage: "Guestack needs browser storage on this page. Allow site data and try again.",
  unexpected: "Something went wrong. Go back to the site and try again.",
};

class StorageError extends Error {
  constructor() {
    super("storage");
    this.name = "StorageError";
  }
}

// Accessing localStorage itself can throw (blocked site data), so every access is guarded.
function storageArea(name) {
  const area = () => {
    try {
      return window[name];
    } catch {
      throw new StorageError();
    }
  };
  const guard = (fn) => {
    try {
      return fn(area());
    } catch {
      throw new StorageError();
    }
  };
  return {
    get: (key) => guard((s) => s.getItem(key)),
    set: (key, value) => guard((s) => s.setItem(key, value)),
    remove: (key) => guard((s) => s.removeItem(key)),
  };
}

const root = document.getElementById("app");

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  for (const child of children) node.append(child);
  return node;
}

function render(view) {
  root.replaceChildren();
  root.dataset.view = view.kind;
  if (view.kind === "choose") {
    if (view.notice) root.append(el("p", { class: "notice", "data-notice": view.notice }, MESSAGES[view.notice]));
    const google = el("button", { type: "button", id: "google" }, "Continue with Google");
    const telegram = el("button", { type: "button", id: "telegram" }, "Continue with Telegram");
    google.addEventListener("click", () => startLogin(env, "google"));
    telegram.addEventListener("click", () => startLogin(env, "telegram"));
    root.append(el("p", { class: "privacy" }, PRIVACY), el("div", { class: "buttons" }, google, telegram));
  } else if (view.kind === "error") {
    root.append(el("p", { class: "error", "data-error": view.code }, ERRORS[view.code] || ERRORS.unexpected));
  } else {
    root.append(el("p", {}, MESSAGES[view.kind] || ""));
  }
}

const env = {
  url: new URL(location.href),
  referrer: document.referrer,
  nowMs: Date.now(),
  local: storageArea("localStorage"),
  session: storageArea("sessionStorage"),
  api: call,
  navigate: (url, { replace }) => (replace ? location.replace(url) : location.assign(url)),
  cleanUrl: () => history.replaceState(null, "", location.pathname),
  render,
  config,
};

run(env);
