export type SignInValues = {
  email: string;
  password: string;
};

export function signInFormValuesFromState(
  state: Partial<SignInValues> | null | undefined,
  form?: HTMLFormElement | null,
): SignInValues;

export function validateSignInValues(values: SignInValues): string | null;

export function createSignInRequestGate(): {
  isInFlight(): boolean;
  start(): boolean;
  finish(): void;
};
