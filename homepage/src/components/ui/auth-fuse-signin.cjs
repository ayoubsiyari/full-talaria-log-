function signInFormValuesFromState(state, form) {
  const stateValues = state && typeof state === "object" ? state : {};
  const liveEmail = readNamedFormValue(form, "email");
  const livePassword = readNamedFormValue(form, "password");
  const email =
    typeof liveEmail === "string" && liveEmail.length > 0
      ? liveEmail
      : String(stateValues.email || "");
  const password =
    typeof livePassword === "string" && livePassword.length > 0
      ? livePassword
      : String(stateValues.password || "");

  return {
    email: email.trim(),
    password,
  };
}

function readNamedFormValue(form, name) {
  if (!form || !form.elements || typeof form.elements.namedItem !== "function") {
    return null;
  }
  const field = form.elements.namedItem(name);
  if (!field || typeof field.value !== "string") {
    return null;
  }
  return field.value;
}

function validateSignInValues(values) {
  if (!values || !isValidEmail(values.email) || !values.password) {
    return "Please enter a valid email and password";
  }
  return null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createSignInRequestGate() {
  let inFlight = false;
  return {
    isInFlight() {
      return inFlight;
    },
    start() {
      if (inFlight) {
        return false;
      }
      inFlight = true;
      return true;
    },
    finish() {
      inFlight = false;
    },
  };
}

module.exports = {
  createSignInRequestGate,
  signInFormValuesFromState,
  validateSignInValues,
};
