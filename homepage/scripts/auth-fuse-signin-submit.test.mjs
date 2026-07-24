import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  createSignInRequestGate,
  signInFormValuesFromState,
  validateSignInValues,
} = require("../src/components/ui/auth-fuse-signin.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFusePath = path.join(__dirname, "../src/components/ui/auth-fuse.tsx");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeForm(fields) {
  const elements = new Map(
    Object.entries(fields).map(([name, value]) => [name, { name, value }]),
  );
  return {
    elements: {
      namedItem(name) {
        return elements.get(name) || null;
      },
    },
    field(name) {
      return elements.get(name);
    },
  };
}

function createHarness() {
  const form = fakeForm({ email: "", password: "" });
  const state = { email: "", password: "" };
  const gate = createSignInRequestGate();
  const requests = [];
  const pending = [];
  const errors = [];

  function syncField(name) {
    state[name] = form.field(name).value;
  }

  async function delayedType(name, value) {
    for (const char of value) {
      form.field(name).value += char;
      syncField(name);
      await Promise.resolve();
    }
  }

  function nativeSetAndDispatch(name, value, events = ["input", "change", "blur"]) {
    form.field(name).value = value;
    for (const eventName of events) {
      if (eventName === "input" || eventName === "change") {
        syncField(name);
      }
    }
  }

  function compositionCommit(name, value) {
    form.field(name).value = value;
    syncField(name);
  }

  function submit(source) {
    const values = signInFormValuesFromState(state, form);
    const validationError = validateSignInValues(values);
    if (validationError) {
      errors.push(validationError);
      return Promise.resolve({ dispatched: false, source });
    }
    if (!gate.start()) {
      return Promise.resolve({ dispatched: false, source });
    }
    const ticket = deferred();
    requests.push({ source, values });
    pending.push(ticket);
    return ticket.promise.finally(() => gate.finish());
  }

  return {
    form,
    state,
    requests,
    pending,
    errors,
    delayedType,
    nativeSetAndDispatch,
    compositionCommit,
    clickSubmit: () => submit("click"),
    enterSubmit: () => submit("enter"),
    pointerSubmit: () => submit("pointer"),
  };
}

test("SignInForm is wired to the local submit helper and controlled values", async () => {
  const source = await readFile(authFusePath, "utf8");
  assert.match(source, /auth-fuse-signin\.cjs/);
  assert.match(source, /createSignInRequestGate/);
  assert.match(source, /signInFormValuesFromState/);
  assert.match(source, /value=\{email\}/);
  assert.match(source, /value=\{password\}/);
  assert.doesNotMatch(source, /const data = new FormData\(form\);[\s\S]*\/api\/auth\/login/);
});

test("delayed typing followed by click dispatches one current login request", async () => {
  const h = createHarness();
  await h.delayedType("email", "person@example.test");
  await h.delayedType("password", "correct horse battery");

  const request = h.clickSubmit();

  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.requests[0], {
    source: "click",
    values: {
      email: "person@example.test",
      password: "correct horse battery",
    },
  });
  assert.equal(h.form.field("email").value, "person@example.test");
  assert.equal(h.form.field("password").value, "correct horse battery");

  h.pending[0].resolve({ ok: true });
  await request;
});

test("native setter input/change/blur followed by Enter dispatches current values", async () => {
  const h = createHarness();
  h.nativeSetAndDispatch("email", "native@example.test");
  h.nativeSetAndDispatch("password", "native-secret-123");

  const request = h.enterSubmit();

  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].source, "enter");
  assert.deepEqual(h.requests[0].values, {
    email: "native@example.test",
    password: "native-secret-123",
  });

  h.pending[0].resolve({ ok: false });
  await request;
});

test("composition and password-manager-like input remain intact before dispatch", async () => {
  const h = createHarness();
  h.compositionCommit("email", "composed@example.test");
  h.nativeSetAndDispatch("password", "filled-by-manager", ["input"]);

  const request = h.pointerSubmit();

  assert.equal(h.requests.length, 1);
  assert.equal(h.form.field("email").value.length, "composed@example.test".length);
  assert.equal(h.form.field("password").value.length, "filled-by-manager".length);

  h.pending[0].resolve({ ok: false });
  await request;
});

test("duplicate submit is blocked only while a request is in flight", async () => {
  const h = createHarness();
  h.nativeSetAndDispatch("email", "dupe@example.test");
  h.nativeSetAndDispatch("password", "not-yet-finished");

  const first = h.clickSubmit();
  const second = h.enterSubmit();

  assert.equal(h.requests.length, 1);
  await second;

  h.pending[0].resolve({ ok: false });
  await first;

  const third = h.enterSubmit();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].source, "enter");

  h.pending[1].resolve({ ok: false });
  await third;
});

test("validation errors do not start an in-flight request or clear fields", async () => {
  const h = createHarness();
  h.nativeSetAndDispatch("email", "not-an-email");
  h.nativeSetAndDispatch("password", "still-present");

  await h.clickSubmit();

  assert.equal(h.requests.length, 0);
  assert.equal(h.errors.length, 1);
  assert.equal(h.form.field("email").value, "not-an-email");
  assert.equal(h.form.field("password").value, "still-present");
});
