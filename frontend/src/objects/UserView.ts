import { requireObject, requireString } from "../apis/shared/decode";

/** 契约 §1.1 UserView(id, username, createdAt)。 */
export interface UserView {
  readonly id: string;
  readonly username: string;
  readonly createdAt: string;
}

export const parseUserView = (value: unknown): UserView => {
  const record = requireObject(value, "user");
  return {
    id: requireString(record.id, "user.id"),
    username: requireString(record.username, "user.username"),
    createdAt: requireString(record.createdAt, "user.createdAt"),
  };
};
