import type { PasswordFormErrors, PasswordFormValues } from "../objects/AccountPage";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

/** 与后端 PasswordPolicy 同一长度规则；另加「与当前不同」「两次一致」的前端体验校验。 */
export const validatePasswordChange = (values: PasswordFormValues): PasswordFormErrors => ({
  currentPassword: values.currentPassword === "" ? "请输入当前密码" : null,
  newPassword:
    values.newPassword.length < MIN_PASSWORD || values.newPassword.length > MAX_PASSWORD
      ? `新密码需为 ${MIN_PASSWORD}–${MAX_PASSWORD} 个字符`
      : values.newPassword === values.currentPassword
        ? "新密码不能与当前密码相同"
        : null,
  confirmPassword: values.confirmPassword !== values.newPassword ? "两次输入的新密码不一致" : null,
});

export const hasPasswordErrors = (errors: PasswordFormErrors): boolean =>
  errors.currentPassword !== null || errors.newPassword !== null || errors.confirmPassword !== null;
