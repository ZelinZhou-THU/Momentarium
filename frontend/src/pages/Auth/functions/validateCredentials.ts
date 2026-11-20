import type { Credentials, CredentialErrors } from "../objects/AuthForm";

/** 与 docs/api-contract.md §1.1 的 users 校验规则一致：3–32 位字母/数字/下划线，密码 8–72 位。 */
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

export const EMPTY_CREDENTIAL_ERRORS: CredentialErrors = { username: null, password: null };

const validateUsername = (username: string): string | null => {
  const trimmed = username.trim();
  if (trimmed.length === 0) {
    return "请输入用户名";
  }
  if (!USERNAME_PATTERN.test(trimmed)) {
    return "用户名需为 3–32 位字母、数字或下划线";
  }
  return null;
};

const validatePassword = (password: string): string | null => {
  if (password.length === 0) {
    return "请输入密码";
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return "密码需为 8–72 位";
  }
  return null;
};

export const hasCredentialErrors = (errors: CredentialErrors): boolean =>
  errors.username !== null || errors.password !== null;

export const validateCredentials = (credentials: Credentials): CredentialErrors => ({
  username: validateUsername(credentials.username),
  password: validatePassword(credentials.password),
});
