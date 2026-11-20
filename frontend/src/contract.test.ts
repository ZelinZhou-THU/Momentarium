import { MESSAGE_ROUTE_INVENTORY } from "./apis/routeInventory.fixture";
import { describe, expect, it } from "vitest";

import { DecodeError } from "./apis/shared/decode";
import { parseAuthResponse } from "./objects/AuthResponse";
import { parseEmptyResponse } from "./objects/EmptyResponse";
import { parseUserView } from "./objects/UserView";
import { parseProfileView } from "./objects/ProfileView";
import { parsePhotoInsightsResponse } from "./objects/curation/PhotoInsightsResponse";
import { parseAuthorPageView } from "./objects/gallery/AuthorPageView";
import {
  CONTRIBUTION_INVITE_STATUSES,
  CONTRIBUTION_PARTICIPANT_STATUSES,
  CONTRIBUTION_STATUSES,
} from "./objects/gallery/ContributionEnums";
import { parseSceneRunHistoryResponse } from "./objects/scene/SceneRunHistoryResponse";
import { parseChatHistoryResponse } from "./objects/curation/ChatHistoryResponse";
import { parseRefineCurationResponse } from "./objects/curation/RefineCurationResponse";
import { parseThemeSuggestionsResponse } from "./objects/curation/ThemeSuggestionsResponse";
import { parseCoverView } from "./objects/gallery/CoverView";
import { parseCoverRenderUploadResponse } from "./objects/gallery/CoverRenderUploadResponse";
import {
  parseContributionAdoptionView,
  parseContributionSummary,
  parseContributionsResponse,
} from "./objects/gallery/Contribution";
import {
  parseContributionInviteCreated,
  parseContributionInvitePreview,
  parseContributionInviteSummary,
  parseContributionMembershipView,
} from "./objects/gallery/ContributionInvite";
import { parseContributionManagementResponse } from "./objects/gallery/ContributionManagement";
import { parseContributionUploadResponse } from "./objects/gallery/ContributionUpload";
import { parseCreateExhibitionResponse } from "./objects/gallery/CreateExhibitionResponse";
import { parseExhibitionDetail } from "./objects/gallery/ExhibitionDetail";
import { parseMyExhibitionsResponse } from "./objects/gallery/MyExhibitionsResponse";
import { parsePhotoLocationView } from "./objects/gallery/PhotoLocationView";
import { parsePhotoLocationCandidatesResponse } from "./objects/curation/PhotoLocationCandidatesResponse";
import { parsePlaceSearchResponse } from "./objects/gallery/PlaceSearchResponse";
import { parsePublishedSceneResponse } from "./objects/gallery/PublishedSceneResponse";
import { parsePublicExhibitionView } from "./objects/gallery/PublicExhibitionView";
import { parsePublishExhibitionResponse } from "./objects/gallery/PublishExhibitionResponse";
import { parseSceneRunView } from "./objects/gallery/SceneRunView";
import { parseUploadPhotosResponse } from "./objects/gallery/UploadPhotosResponse";
import type { PhotoView } from "./objects/gallery/PhotoView";

/**
 * 前端契约测试（spec §8.7 / api-contract §6）：仓库根 `docs/contracts/` 的共享 JSON 样例是
 * 前后端唯一可执行期望值。样例先经前端解码层（parseXxx）解码，再校验固定格式（UUID、
 * ISO-8601 UTC、camelCase、枚举小写、Option=null 不省略）。
 *
 * 失败信息统一带样例文件名与字段路径；新增服务样例必须在此登记解码器，否则用例失败。
 */
const fixtureModules = import.meta.glob<string>("../../docs/contracts/**/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** glob 键（如 ../../docs/contracts/users/register.response.json）→ users/register.response.json。 */
const fixtures: Record<string, string> = Object.fromEntries(
  Object.entries(fixtureModules).map(([modulePath, text]) => [
    modulePath.replace(/^.*docs\/contracts\//, ""),
    text,
  ]),
);

type FixtureParser = (value: unknown) => unknown;

/** response 样例 → 前端解码层入口；新增契约样例必须在此登记。 */
const responseParsers: Record<string, FixtureParser> = {
  "users/register.response.json": parseAuthResponse,
  "users/login.response.json": parseAuthResponse,
  "users/getcurrentuser.response.json": parseUserView,
  "users/logout.response.json": parseEmptyResponse,
  "users/getmyprofile.response.json": parseProfileView,
  "users/updatemyprofile.response.json": parseProfileView,
  "users/changepassword.response.json": parseAuthResponse,
  "gallery/getauthorpage.response.json": parseAuthorPageView,
  "curation/getphotoinsights.response.json": parsePhotoInsightsResponse,
  "scene/listsceneruns.response.json": parseSceneRunHistoryResponse,
  "scene/getscenerunbyid.response.json": parseSceneRunView,
  "scene/restorescenerun.response.json": parseSceneRunView,
  "scene/revisescene.response.json": parseSceneRunView,
  "scene/acceptscenerun.response.json": parseSceneRunView,
  "scene/dismissscenerun.response.json": parseSceneRunView,
  "gallery/createexhibition.response.json": parseCreateExhibitionResponse,
  "gallery/listmyexhibitions.response.json": parseMyExhibitionsResponse,
  "gallery/getexhibition.response.json": parseExhibitionDetail,
  "gallery/updatecuration.response.json": parseExhibitionDetail,
  "gallery/updateexhibitionmeta.response.json": parseEmptyResponse,
  "gallery/deletephoto.response.json": parseEmptyResponse,
  "gallery/deleteexhibition.response.json": parseEmptyResponse,
  "gallery/setcover.response.json": parseCoverView,
  "gallery/upload.response.json": parseUploadPhotosResponse,
  "gallery/publish.response.json": parsePublishExhibitionResponse,
  "gallery/getpublishedexhibition.response.json": parsePublicExhibitionView,
  "gallery/setphotolocation.response.json": parsePhotoLocationView,
  "gallery/clearphotolocation.response.json": parseEmptyResponse,
  "gallery/searchplaces.response.json": parsePlaceSearchResponse,
  "gallery/coverrenderupload.response.json": parseCoverRenderUploadResponse,
  "curation/suggestphotolocation.response.json": parsePhotoLocationCandidatesResponse,
  "curation/getphotolocationcandidates.response.json": parsePhotoLocationCandidatesResponse,
  "curation/confirmphotolocationcandidate.response.json": parsePhotoLocationView,
  "gallery/createcontributioninvite.response.json": parseContributionInviteCreated,
  "gallery/getcontributionmanagement.response.json": parseContributionManagementResponse,
  "gallery/closecontributioninvite.response.json": parseContributionInviteSummary,
  "gallery/getcontributioninvite.response.json": parseContributionInvitePreview,
  "gallery/joincontribution.response.json": parseContributionMembershipView,
  "gallery/revokecontributor.response.json": parseEmptyResponse,
  "gallery/listcontributions.response.json": parseContributionsResponse,
  "gallery/updatecontribution.response.json": parseContributionSummary,
  "gallery/withdrawcontribution.response.json": parseEmptyResponse,
  "gallery/adoptcontribution.response.json": parseContributionAdoptionView,
  "gallery/removememory.response.json": parseEmptyResponse,
  "gallery/contributionupload.response.json": parseContributionUploadResponse,
  "gallery/createcontribution.response.json": parseContributionSummary,
  "gallery/declinecontribution.response.json": parseContributionSummary,
  "curation/suggestthemes.response.json": parseThemeSuggestionsResponse,
  "curation/refinecuration.response.json": parseRefineCurationResponse,
  "curation/getchathistory.response.json": parseChatHistoryResponse,
  "scene/generatescene.response.json": parseSceneRunView,
  "scene/getscenerun.response.json": parseSceneRunView,
  "scene/cancelscene.response.json": parseSceneRunView,
  "scene/reviewscene.response.json": parseSceneRunView,
  "scene/getpublishedscene.response.json": parsePublishedSceneResponse,
};

const fixtureKeys = Object.keys(fixtures).sort();
const responseKeys = fixtureKeys.filter((key) => key.endsWith(".response.json"));
const requestKeys = fixtureKeys.filter((key) => key.endsWith(".request.json"));

/**
 * 待接入 fixture 豁免集合：D6 起必须为空（52 条注册路由 + 非消息对象样例全部登记）。
 * “待接入 fixture 清单与解码器登记保持同步”用例会断言其为空；新增样例必须直接登记 parseXxx。
 */
const pendingResponseFixtureKeys: ReadonlySet<string> = new Set();

/** 52 条注册路由（spec §8.3 / api-contract §2.2/§3.2/§4.2/§4.3）：无请求消息只要求 response 样例。 */
const CONTRACT_ROUTES = MESSAGE_ROUTE_INVENTORY.map(({ service, routeName, requiresRequestBody }) => ({
  service, route: routeName, requestBody: requiresRequestBody,
}));

const JSON_OBJECT = "[object Object]";

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === JSON_OBJECT;

const fixtureJson = (key: string): unknown => {
  const text = fixtures[key];
  if (text === undefined) {
    throw new Error(`契约样例缺失：${key}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `契约样例 ${key} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const describeDecodeFailure = (error: unknown): string => {
  if (error instanceof DecodeError) {
    return `字段 ${error.path} 与 api-contract 不一致`;
  }
  return error instanceof Error ? error.message : String(error);
};

const decodeFixture = (key: string): unknown => {
  const parser = responseParsers[key];
  if (parser === undefined) {
    throw new Error(`契约样例 ${key} 未登记前端解码器；新增样例必须同时登记 parseXxx`);
  }
  try {
    return parser(fixtureJson(key));
  } catch (error) {
    throw new Error(`契约样例 ${key} 经前端解码层失败：${describeDecodeFailure(error)}`);
  }
};

const forEachJsonValue = (
  value: unknown,
  visit: (value: unknown, path: string) => void,
  path = "$",
): void => {
  visit(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => forEachJsonValue(item, visit, `${path}[${index}]`));
  } else if (isJsonObject(value)) {
    Object.entries(value).forEach(([field, child]) =>
      forEachJsonValue(child, visit, `${path}.${field}`),
    );
  }
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const CAMEL_CASE_PATTERN = /^[a-z][A-Za-z0-9]*$/;
const COVER_KINDS: readonly string[] = ["auto", "photo", "render"];
const SCENE_RUN_KINDS: readonly string[] = ["generate", "revise", "restore"];
const SCENE_STATUSES: readonly string[] = [
  "queued",
  "generating",
  "awaiting_capture",
  "reviewing",
  "succeeded",
  "failed",
  "cancelled",
];
const SCENE_SOURCES: readonly string[] = ["ai", "fallback"];
const REVIEW_VERDICTS: readonly string[] = ["pass", "revise"];
const CHAT_ROLES: readonly string[] = ["user", "assistant"];
const LOCATION_SOURCES: readonly string[] = ["exif", "manual", "ai"];
const LOCATION_STATUSES: readonly string[] = ["suggested", "confirmed"];
const LOCATION_GRANULARITIES: readonly string[] = ["hidden", "area", "exact"];

const isUuidField = (field: string): boolean => field === "id" || field.endsWith("Id");
const isTimestampField = (field: string): boolean => field.endsWith("At");

const photoComparable = (photo: PhotoView): unknown => ({
  id: photo.id,
  originalName: photo.originalName,
  mime: photo.mime,
  width: photo.width,
  height: photo.height,
  caption: photo.caption,
  groupId: photo.groupId,
  positionInGroup: photo.positionInGroup,
  contentUrl: photo.contentUrl,
  thumbUrl: photo.thumbUrl,
  memories: photo.memories,
});

describe("docs/contracts 共享样例", () => {
  it("从仓库根发现 users 与 gallery 样例", () => {
    expect(responseKeys.length).toBeGreaterThanOrEqual(12);
    const services = new Set(fixtureKeys.map((key) => key.split("/")[0]));
    expect(services.has("users")).toBe(true);
    expect(services.has("gallery")).toBe(true);
  });

  it("每份 response 样例都登记了前端解码器（待接入 fixture 除外）", () => {
    const missing = responseKeys.filter(
      (key) => responseParsers[key] === undefined && !pendingResponseFixtureKeys.has(key),
    );
    expect(missing, `未登记解码器的样例：${missing.join(", ")}`).toEqual([]);
  });

  it("待接入 fixture 清单与解码器登记保持同步", () => {
    expect(pendingResponseFixtureKeys.size, "D6 起 pending 必须为空，请登记 parseXxx 后移除").toBe(0);
    const missingFixtures = [...pendingResponseFixtureKeys].filter(
      (key) => !fixtureKeys.includes(key),
    );
    expect(missingFixtures, `待接入清单中的样例不存在：${missingFixtures.join(", ")}`).toEqual([]);
    const alreadyRegistered = [...pendingResponseFixtureKeys].filter(
      (key) => responseParsers[key] !== undefined,
    );
    expect(
      alreadyRegistered,
      `已登记解码器，请从 pendingResponseFixtureKeys 移除：${alreadyRegistered.join(", ")}`,
    ).toEqual([]);
  });

  it("request 样例是合法 JSON（前端不负责解码请求体，由后端契约测试覆盖）", () => {
    requestKeys.forEach((key) => fixtureJson(key));
    expect(requestKeys.length).toBeGreaterThan(0);
  });

  it("52 条注册路由均有契约样例（无请求消息只要求 response）", () => {
    expect(CONTRACT_ROUTES.length).toBe(52);
    const missing = CONTRACT_ROUTES.flatMap(({ service, route, requestBody }) => {
      const required = [`${service}/${route}.response.json`];
      if (requestBody) {
        required.push(`${service}/${route}.request.json`);
      }
      return required.filter((key) => !fixtureKeys.includes(key));
    });
    expect(missing, `缺少契约样例：${missing.join(", ")}`).toEqual([]);
  });

  it("response 样例均属于 52 路由或已登记的非消息对象样例", () => {
    const expectedResponseKeys = new Set([
      ...CONTRACT_ROUTES.map(({ service, route }) => `${service}/${route}.response.json`),
      "gallery/upload.response.json",
      "gallery/coverrenderupload.response.json",
      "gallery/contributionupload.response.json",
    ]);
    const unexpected = responseKeys.filter((key) => !expectedResponseKeys.has(key));
    expect(unexpected, `存在未登记路由的 response 样例：${unexpected.join(", ")}`).toEqual([]);
  });


  it("UUID 字段是 UUID 字符串，其余 ID 为字符串", () => {
    const violations: string[] = [];
    fixtureKeys.forEach((key) => {
      forEachJsonValue(fixtureJson(key), (value, path) => {
        if (!isJsonObject(value)) return;
        Object.entries(value).forEach(([field, fieldValue]) => {
          if (isUuidField(field) && typeof fieldValue === "string" && !UUID_PATTERN.test(fieldValue)) {
            violations.push(`${key}: ${path}.${field} 不是 UUID（${fieldValue}）`);
          }
        });
      });
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("时间字段是 ISO-8601 UTC", () => {
    const violations: string[] = [];
    fixtureKeys.forEach((key) => {
      forEachJsonValue(fixtureJson(key), (value, path) => {
        if (!isJsonObject(value)) return;
        Object.entries(value).forEach(([field, fieldValue]) => {
          if (
            isTimestampField(field) &&
            typeof fieldValue === "string" &&
            !ISO_UTC_PATTERN.test(fieldValue)
          ) {
            violations.push(`${key}: ${path}.${field} 不是 ISO-8601 UTC（${fieldValue}）`);
          }
        });
      });
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("字段名为 camelCase，枚举取小写契约值", () => {
    const violations: string[] = [];
    fixtureKeys.forEach((key) => {
      forEachJsonValue(fixtureJson(key), (value, path) => {
        if (!isJsonObject(value)) return;
        Object.entries(value).forEach(([field, fieldValue]) => {
          if (!CAMEL_CASE_PATTERN.test(field)) {
            violations.push(`${key}: ${path}.${field} 不是 camelCase`);
          }
          if (field === "kind" && !COVER_KINDS.includes(String(fieldValue))) {
            // 场景运行（scene/* 或嵌套 sceneRun）的 kind 是另一套枚举，不按封面 kind 校验。
            const isSceneRunKind =
              key.startsWith("scene/") ||
              path.includes(".sceneRun") ||
              path.includes(".currentSceneRun");
            if (!(isSceneRunKind && SCENE_RUN_KINDS.includes(String(fieldValue)))) {
              violations.push(`${key}: ${path}.kind 不是封面枚举值（${String(fieldValue)}）`);
            }
          }
          // locations 数组里的 source/status 是位置枚举；阶段 2 的投稿/邀请/参与是另外几套封闭集合。
          const inLocations =
            key === "gallery/setphotolocation.response.json" ||
            key === "curation/confirmphotolocationcandidate.response.json" ||
            path.includes(".locations[");
          const isContributionSummary =
            path.includes(".contributions[") ||
            key === "gallery/updatecontribution.response.json" ||
            key === "gallery/createcontribution.response.json" ||
            key === "gallery/declinecontribution.response.json";
          const isInviteFixture =
            path.includes(".invites[") ||
            key === "gallery/closecontributioninvite.response.json" ||
            key === "gallery/getcontributioninvite.response.json";
          const isParticipantFixture =
            path.includes(".participants[") || key === "gallery/joincontribution.response.json";
          const allowedStatuses: readonly string[] = inLocations
            ? LOCATION_STATUSES
            : isContributionSummary
              ? CONTRIBUTION_STATUSES
              : isInviteFixture
                ? CONTRIBUTION_INVITE_STATUSES
                : isParticipantFixture
                  ? CONTRIBUTION_PARTICIPANT_STATUSES
                  : SCENE_STATUSES;
          if (field === "status" && !allowedStatuses.includes(String(fieldValue))) {
            violations.push(`${key}: ${path}.status 不是枚举值（${String(fieldValue)}）`);
          }
          const inContributionLocation = path.endsWith(".location");
          if (
            field === "source" &&
            fieldValue !== null &&
            !(inLocations || inContributionLocation ? LOCATION_SOURCES : SCENE_SOURCES).includes(
              String(fieldValue),
            )
          ) {
            violations.push(`${key}: ${path}.source 不是枚举值（${String(fieldValue)}）`);
          }
          if (
            field === "granularity" &&
            fieldValue !== null &&
            !LOCATION_GRANULARITIES.includes(String(fieldValue))
          ) {
            violations.push(`${key}: ${path}.granularity 不是位置粒度枚举值（${String(fieldValue)}）`);
          }
          if (field === "verdict" && !REVIEW_VERDICTS.includes(String(fieldValue))) {
            violations.push(`${key}: ${path}.verdict 不是评审结论枚举值（${String(fieldValue)}）`);
          }
          if (field === "role" && !CHAT_ROLES.includes(String(fieldValue))) {
            violations.push(`${key}: ${path}.role 不是对话角色枚举值（${String(fieldValue)}）`);
          }
        });
      });
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("Option 字段以 null 显式存在（不省略）", () => {
    const list = parseMyExhibitionsResponse(fixtureJson("gallery/listmyexhibitions.response.json"));
    expect(Object.hasOwn(list.exhibitions[0] ?? {}, "publication")).toBe(true);
    expect(list.exhibitions.some((summary) => summary.publication === null)).toBe(true);

    const detail = parseExhibitionDetail(fixtureJson("gallery/getexhibition.response.json"));
    expect(Object.hasOwn(detail, "sceneRun")).toBe(true);
    expect(detail.sceneRun).toBeNull();
    expect(Object.hasOwn(detail, "publication")).toBe(true);
    expect(detail.publication).toBeNull();
    expect(detail.ungroupedPhotos[0]?.groupId).toBeNull();
    expect(detail.ungroupedPhotos[0]?.positionInGroup).toBeNull();
    // v1.7 位置：可空坐标按 null 显式存在（不省略字段）。
    expect(detail.locations).toHaveLength(3);
    expect(detail.locations.some((location) => location.latitude === null)).toBe(true);
    expect(detail.locations.some((location) => location.longitude === null)).toBe(true);

    const upload = parseUploadPhotosResponse(fixtureJson("gallery/upload.response.json"));
    expect(Object.hasOwn(upload.photos[0] ?? {}, "groupId")).toBe(true);
    expect(upload.photos[0]?.groupId).toBeNull();
    expect(upload.photos[0]?.positionInGroup).toBeNull();
    expect(upload.failures[0]?.reason).toMatch(/^UPLOAD_[A-Z_]+$/);

    const setCoverRequest = fixtureJson("gallery/setcover.request.json");
    expect(isJsonObject(setCoverRequest) && Object.hasOwn(setCoverRequest, "renderKey")).toBe(true);
    expect(isJsonObject(setCoverRequest) ? setCoverRequest.renderKey : undefined).toBeNull();

    const suggestThemesRequest = fixtureJson("curation/suggestthemes.request.json");
    expect(isJsonObject(suggestThemesRequest) && Object.hasOwn(suggestThemesRequest, "hint")).toBe(true);
    expect(isJsonObject(suggestThemesRequest) ? suggestThemesRequest.hint : undefined).toBeNull();
  });

  it("updatecuration.request 的嵌套策展结构符合契约", () => {
    const request = fixtureJson("gallery/updatecuration.request.json");
    expect(isJsonObject(request)).toBe(true);
    const requestRecord = isJsonObject(request) ? request : {};
    expect(typeof requestRecord.exhibitionId === "string" && UUID_PATTERN.test(requestRecord.exhibitionId)).toBe(true);
    expect(typeof requestRecord.title).toBe("string");
    expect(typeof requestRecord.narrative).toBe("string");
    expect(Array.isArray(requestRecord.groups)).toBe(true);
    const groups = Array.isArray(requestRecord.groups) ? requestRecord.groups : [];
    expect(groups.length).toBeGreaterThanOrEqual(2);
    groups.forEach((group, groupIndex) => {
      expect(isJsonObject(group), `groups[${groupIndex}] 不是对象`).toBe(true);
      const groupRecord = isJsonObject(group) ? group : {};
      expect(typeof groupRecord.title).toBe("string");
      expect(typeof groupRecord.narrative).toBe("string");
      expect(Array.isArray(groupRecord.photos), `groups[${groupIndex}].photos 不是数组`).toBe(true);
      const photos = Array.isArray(groupRecord.photos) ? groupRecord.photos : [];
      expect(photos.length).toBeGreaterThan(0);
      photos.forEach((photo, photoIndex) => {
        expect(isJsonObject(photo), `groups[${groupIndex}].photos[${photoIndex}] 不是对象`).toBe(true);
        const photoRecord = isJsonObject(photo) ? photo : {};
        expect(Object.hasOwn(photoRecord, "photoId")).toBe(true);
        expect(typeof photoRecord.photoId === "string" && UUID_PATTERN.test(photoRecord.photoId)).toBe(
          true,
        );
        expect(typeof photoRecord.caption).toBe("string");
      });
    });
  });

  it("reviewscene.request 的 captures/runtime 结构符合契约（D5）", () => {
    const request = fixtureJson("scene/reviewscene.request.json");
    expect(isJsonObject(request)).toBe(true);
    const requestRecord = isJsonObject(request) ? request : {};
    expect(
      typeof requestRecord.runId === "string" && UUID_PATTERN.test(requestRecord.runId),
      "runId 必须是 UUID",
    ).toBe(true);
    expect(Array.isArray(requestRecord.captures)).toBe(true);
    const captures = Array.isArray(requestRecord.captures) ? requestRecord.captures : [];
    expect(captures.length).toBe(4);
    captures.forEach((capture, index) => {
      expect(
        typeof capture === "string" && capture.startsWith("data:image/jpeg;base64,"),
        `captures[${index}] 必须是 JPEG data URL`,
      ).toBe(true);
    });
    expect(isJsonObject(requestRecord.runtime)).toBe(true);
    const runtime = isJsonObject(requestRecord.runtime) ? requestRecord.runtime : {};
    expect(typeof runtime.buildMs).toBe("number");
    expect(typeof runtime.fps).toBe("number");
    expect(Array.isArray(runtime.errors)).toBe(true);
    expect(Array.isArray(runtime.photoIdsUsed)).toBe(true);
    const photoIdsUsed = Array.isArray(runtime.photoIdsUsed) ? runtime.photoIdsUsed : [];
    photoIdsUsed.forEach((photoId, index) => {
      expect(
        typeof photoId === "string" && UUID_PATTERN.test(photoId),
        `runtime.photoIdsUsed[${index}] 必须是 UUID`,
      ).toBe(true);
    });
    expect(typeof runtime.networkAttempts).toBe("number");
  });

  it("四张满额图片的 base64 评审请求小于 12 MiB 总体上限", () => {
    const sample = fixtureJson("scene/reviewscene.request.json");
    expect(isJsonObject(sample)).toBe(true);
    const base64 = "A".repeat(Math.ceil((2 * 1024 * 1024) / 3) * 4 - 1) + "=";
    const body = { ...(isJsonObject(sample) ? sample : {}), captures: Array.from({ length: 4 }, () => `data:image/jpeg;base64,${base64}`) };
    const bytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
    expect(bytes).toBeGreaterThan(8 * 1024 * 1024);
    expect(bytes).toBeLessThan(12 * 1024 * 1024);
  });

  it("cancelscene.request 的 runId 结构符合契约（D5）", () => {
    const request = fixtureJson("scene/cancelscene.request.json");
    expect(isJsonObject(request)).toBe(true);
    const requestRecord = isJsonObject(request) ? request : {};
    expect(
      typeof requestRecord.runId === "string" && UUID_PATTERN.test(requestRecord.runId),
      "runId 必须是 UUID",
    ).toBe(true);
  });

  it("getauthorpage.response 解码后保留 v1.8 公开足迹位置", () => {
    const page = parseAuthorPageView(fixtureJson("gallery/getauthorpage.response.json"));
    expect(page.journeyLocations.length).toBeGreaterThan(0);
    expect(
      page.journeyLocations.every(
        (location) => location.granularity === "area" || location.granularity === "exact",
      ),
    ).toBe(true);
    expect(page.journeyLocations[0]?.exhibitionTitle.length).toBeGreaterThan(0);
  });

  it("register.response 解码后可重建与样例等价的对象（往返）", () => {
    const sample = fixtureJson("users/register.response.json");
    const decoded = parseAuthResponse(sample);
    expect({
      token: decoded.token,
      user: {
        id: decoded.user.id,
        username: decoded.user.username,
        createdAt: decoded.user.createdAt,
      },
    }).toEqual(sample);
  });

  it("getexhibition.response 解码后可重建与样例等价的对象（往返）", () => {
    const sample = fixtureJson("gallery/getexhibition.response.json");
    const decoded = parseExhibitionDetail(sample);
    expect({
      id: decoded.id,
      title: decoded.title,
      narrative: decoded.narrative,
      updatedAt: decoded.updatedAt,
      groups: decoded.groups.map((group) => ({
        id: group.id,
        title: group.title,
        narrative: group.narrative,
        position: group.position,
        photos: group.photos.map(photoComparable),
      })),
      ungroupedPhotos: decoded.ungroupedPhotos.map(photoComparable),
      currentSceneRun: decoded.currentSceneRun,
    sceneRun: decoded.sceneRun,
      sceneStale: decoded.sceneStale,
      cover: {
        kind: decoded.cover.kind,
        imageUrl: decoded.cover.imageUrl,
        width: decoded.cover.width,
        height: decoded.cover.height,
      },
      publication: decoded.publication,
      hasUnpublishedChanges: decoded.hasUnpublishedChanges,
      pendingContributionCount: decoded.pendingContributionCount,
      scenePalette: decoded.scenePalette,
      locations: decoded.locations,
    }).toEqual(sample);
  });
});

describe("response 样例经前端解码层解码", () => {
  for (const key of responseKeys.filter((responseKey) => !pendingResponseFixtureKeys.has(responseKey))) {
    it(key, () => {
      expect(() => decodeFixture(key)).not.toThrow();
    });
  }
});
