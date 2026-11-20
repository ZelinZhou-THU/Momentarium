import { describe, expect, it } from "vitest";
import { apiName } from "./apiName";

describe("apiName", () => {
  it("前端 API 类名按后端规则还原为路由名", () => {
    expect(apiName("RegisterAPI")).toBe("register");
    expect(apiName("LoginAPI")).toBe("login");
    expect(apiName("GetCurrentUserAPI")).toBe("getcurrentuser");
    expect(apiName("LogoutAPI")).toBe("logout");
  });

  it("与后端消息类名推导结果一致（去掉 Message 后转小写）", () => {
    expect(apiName("RegisterMessage")).toBe("register");
    expect(apiName("SomeActionMessage")).toBe("someaction");
    expect(apiName("BorrowBookAPIMessage")).toBe("borrowbookapi");
  });

  it("gallery API 类名与 api-contract 路由名一一对应", () => {
    expect(apiName("CreateExhibitionAPI")).toBe("createexhibition");
    expect(apiName("ListMyExhibitionsAPI")).toBe("listmyexhibitions");
    expect(apiName("GetExhibitionAPI")).toBe("getexhibition");
    expect(apiName("UpdateExhibitionMetaAPI")).toBe("updateexhibitionmeta");
    expect(apiName("DeleteExhibitionAPI")).toBe("deleteexhibition");
    expect(apiName("SetCoverAPI")).toBe("setcover");
    expect(apiName("PublishAPI")).toBe("publish");
    expect(apiName("GetPublishedExhibitionAPI")).toBe("getpublishedexhibition");
  });
});
