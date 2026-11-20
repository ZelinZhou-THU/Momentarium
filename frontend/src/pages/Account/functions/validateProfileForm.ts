import type { ProfileFormErrors, ProfileFormValues } from "../objects/AccountPage";

const MAX_DISPLAY_NAME = 32;
const MAX_BIO = 200;

/** 与后端 ProfileRules 同一规则：先去首尾空白，再按 Unicode 码点计字数。 */
export const validateProfileForm = (values: ProfileFormValues): ProfileFormErrors => {
  const displayName = values.displayName.trim();
  const bio = values.bio.trim();
  return {
    displayName:
      displayName === ""
        ? "显示名不能为空"
        : [...displayName].length > MAX_DISPLAY_NAME
          ? `显示名最多 ${MAX_DISPLAY_NAME} 个字`
          : null,
    bio: [...bio].length > MAX_BIO ? `简介最多 ${MAX_BIO} 个字` : null,
  };
};

export const hasProfileErrors = (errors: ProfileFormErrors): boolean =>
  errors.displayName !== null || errors.bio !== null;
