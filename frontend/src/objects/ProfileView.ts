import { requireBoolean, requireObject, requireString } from "../apis/shared/decode";

/** 契约 §1.1 ProfileView(username, displayName, bio, homepagePublic, createdAt)。 */
export interface ProfileView {
  readonly username: string;
  readonly displayName: string;
  readonly bio: string;
  readonly homepagePublic: boolean;
  readonly createdAt: string;
}

export const parseProfileView = (value: unknown, path = "profile"): ProfileView => {
  const record = requireObject(value, path);
  return {
    username: requireString(record.username, `${path}.username`),
    displayName: requireString(record.displayName, `${path}.displayName`),
    bio: requireString(record.bio, `${path}.bio`),
    homepagePublic: requireBoolean(record.homepagePublic, `${path}.homepagePublic`),
    createdAt: requireString(record.createdAt, `${path}.createdAt`),
  };
};
