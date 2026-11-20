import type { ProfileView } from "../../../objects/ProfileView";

export type ProfileLoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly profile: ProfileView }
  | { readonly status: "error"; readonly message: string };

export interface ProfileFormValues {
  readonly displayName: string;
  readonly bio: string;
  readonly homepagePublic: boolean;
}

export interface ProfileFormErrors {
  readonly displayName: string | null;
  readonly bio: string | null;
}

export interface PasswordFormValues {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmPassword: string;
}

export interface PasswordFormErrors {
  readonly currentPassword: string | null;
  readonly newPassword: string | null;
  readonly confirmPassword: string | null;
}
