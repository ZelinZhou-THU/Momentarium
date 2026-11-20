package contract

import java.nio.file.{Files, Path, Paths}
import java.util.UUID

import scala.jdk.CollectionConverters.*
import scala.util.{Try, Using}

import io.circe.{Decoder, Encoder, Json, JsonNumber, JsonObject}
import io.circe.parser.parse

import munit.FunSuite

import services.curation.objects.apiTypes.{
  ChatHistoryResponse,
  ConfirmPhotoLocationCandidateRequest,
  GetChatHistoryRequest,
  GetPhotoInsightsRequest,
  GetPhotoLocationCandidatesRequest,
  PhotoInsightsResponse,
  PhotoLocationCandidatesResponse,
  RefineCurationRequest,
  RefineCurationResponse,
  SuggestPhotoLocationRequest,
  SuggestThemesRequest,
  ThemeSuggestionsResponse
}
import services.gallery.objects.apiTypes.{
  AdoptContributionRequest,
  AuthorPageView,
  ClearPhotoLocationRequest,
  CloseContributionInviteRequest,
  ContributionAdoptionView,
  ContributionInviteCreated,
  ContributionInvitePreview,
  ContributionInviteSummary,
  ContributionManagementResponse,
  ContributionMembershipView,
  ContributionSummary,
  ContributionUploadResponse,
  ContributionsResponse,
  CreateContributionInviteRequest,
  CreateContributionRequest,
  DeclineContributionRequest,
  GetAuthorPageRequest,
  GetContributionInviteRequest,
  GetContributionManagementRequest,
  CoverRenderUploadResponse,
  CoverView,
  CreateExhibitionRequest,
  CreateExhibitionResponse,
  DeleteExhibitionRequest,
  DeletePhotoRequest,
  ExhibitionDetail,
  GetExhibitionRequest,
  GetPublishedExhibitionRequest,
  JoinContributionRequest,
  ListContributionsRequest,
  MyExhibitionsResponse,
  PhotoLocationView,
  PlaceSearchResponse,
  PublicExhibitionView,
  PublishExhibitionRequest,
  PublishExhibitionResponse,
  RemoveMemoryRequest,
  RevokeContributorRequest,
  SearchPlacesRequest,
  SetCoverRequest,
  SetPhotoLocationRequest,
  UpdateContributionRequest,
  UpdateCurationRequest,
  UpdateExhibitionMetaRequest,
  UploadPhotosResponse,
  WithdrawContributionRequest
}
import services.scene.objects.apiTypes.{
  AcceptSceneRunRequest,
  CancelSceneRequest,
  DismissSceneRunRequest,
  GenerateSceneRequest,
  GetPublishedSceneRequest,
  GetSceneRunByIdRequest,
  GetSceneRunRequest,
  ListSceneRunsRequest,
  RestoreSceneRunRequest,
  ReviseSceneRequest,
  SceneRunHistoryResponse,
  PublishedSceneResponse,
  ReviewSceneRequest,
  SceneRunView
}
import services.system.api.EmptyResponse
import services.users.objects.apiTypes.{
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  ProfileView,
  RegisterRequest,
  UpdateMyProfileRequest,
  UserView
}

/** 共享契约样例测试：`docs/contracts/` 是前后端唯一可执行期望值。
  *
  * 规则（spec §8.7 / api-contract §6）：
  *   - 每份 response 样例必须 `Decoder[T].decodeJson` 成功，再用 `Encoder[T]` 编码回 JSON，
  *     与样例做对象等价比较（忽略键顺序、浮点容差、null 字段不省略、枚举值一致）。
  *   - 每份 request 样例必须能由对应 `Decoder[T]` 解码成功。
  *   - 失败信息必须带文件名与字段路径，便于定位契约漂移。
  *
  * 新增服务样例时必须在 [[responseChecks]] / [[requestChecks]] 登记对应类型，并加入
  * [[typedServices]]；未登记类型的样例会直接失败，未接入服务的样例则进入“待接入”覆盖清单，
  * 防止契约覆盖悄悄缺失或测试在服务类型落地前变红。
  */
class ContractFixtureSpec extends FunSuite:

  /** 已接入类型化契约校验的服务。D2 gallery，D3 curation，D4 scene（generatescene/getscenerun），D5 补 reviewscene/cancelscene。 */
  private val typedServices: Set[String] = Set("users", "gallery", "curation", "scene")

  /**
   * 待接入 fixture 豁免集合：D6 起必须为空（22 条注册路由 + 非消息对象样例全部登记）。
   * 仅当新增“样例先落盘、类型未就绪”的临时状态时才允许放入，并在接入后立即移除；
   * 下方“待接入 fixture 清单与登记保持同步”用例会断言其为空。
   */
  private val pendingFixtures: Set[String] = Set.empty

  /** 从当前工作目录向上定位包含 `docs/contracts` 的项目根（兼容 sbt 从项目根或子目录运行）。 */
  private val contractsRoot: Path =
    Iterator
      .iterate(Paths.get("").toAbsolutePath)(_.getParent)
      .takeWhile(_ != null)
      .map(_.resolve("docs/contracts"))
      .find(path => Files.isDirectory(path))
      .getOrElse(Paths.get("docs/contracts").toAbsolutePath)

  /** response 样例：路由 -> 用真实领域类型执行 decode → encode → 对象等价校验。 */
  private val responseChecks: Map[String, () => Unit] = Map(
    "users/register.response.json" -> (() => assertRoundTrip[AuthResponse]("users/register.response.json")),
    "users/login.response.json" -> (() => assertRoundTrip[AuthResponse]("users/login.response.json")),
    "users/getcurrentuser.response.json" -> (() => assertRoundTrip[UserView]("users/getcurrentuser.response.json")),
    "users/logout.response.json" -> (() => assertRoundTrip[EmptyResponse]("users/logout.response.json")),
    "users/getmyprofile.response.json" -> (() => assertRoundTrip[ProfileView]("users/getmyprofile.response.json")),
    "users/updatemyprofile.response.json" -> (() =>
      assertRoundTrip[ProfileView]("users/updatemyprofile.response.json")),
    "users/changepassword.response.json" -> (() =>
      assertRoundTrip[AuthResponse]("users/changepassword.response.json")),
    "gallery/getauthorpage.response.json" -> (() =>
      assertRoundTrip[AuthorPageView]("gallery/getauthorpage.response.json")),
    "curation/getphotoinsights.response.json" -> (() =>
      assertRoundTrip[PhotoInsightsResponse]("curation/getphotoinsights.response.json")),
    "curation/suggestphotolocation.response.json" -> (() =>
      assertRoundTrip[PhotoLocationCandidatesResponse]("curation/suggestphotolocation.response.json")),
    "curation/getphotolocationcandidates.response.json" -> (() =>
      assertRoundTrip[PhotoLocationCandidatesResponse]("curation/getphotolocationcandidates.response.json")),
    "curation/confirmphotolocationcandidate.response.json" -> (() =>
      assertRoundTrip[PhotoLocationView]("curation/confirmphotolocationcandidate.response.json")),
    "scene/listsceneruns.response.json" -> (() =>
      assertRoundTrip[SceneRunHistoryResponse]("scene/listsceneruns.response.json")),
    "scene/getscenerunbyid.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/getscenerunbyid.response.json")),
    "scene/restorescenerun.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/restorescenerun.response.json")),
    "scene/revisescene.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/revisescene.response.json")),
    "scene/acceptscenerun.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/acceptscenerun.response.json")),
    "scene/dismissscenerun.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/dismissscenerun.response.json")),
    "gallery/createexhibition.response.json" -> (() =>
      assertRoundTrip[CreateExhibitionResponse]("gallery/createexhibition.response.json")),
    "gallery/listmyexhibitions.response.json" -> (() =>
      assertRoundTrip[MyExhibitionsResponse]("gallery/listmyexhibitions.response.json")),
    "gallery/getexhibition.response.json" -> (() =>
      assertRoundTrip[ExhibitionDetail]("gallery/getexhibition.response.json")),
    "gallery/updatecuration.response.json" -> (() =>
      assertRoundTrip[ExhibitionDetail]("gallery/updatecuration.response.json")),
    "gallery/updateexhibitionmeta.response.json" -> (() =>
      assertRoundTrip[EmptyResponse]("gallery/updateexhibitionmeta.response.json")),
    "gallery/deletephoto.response.json" -> (() =>
      assertRoundTrip[EmptyResponse]("gallery/deletephoto.response.json")),
    "gallery/deleteexhibition.response.json" -> (() =>
      assertRoundTrip[EmptyResponse]("gallery/deleteexhibition.response.json")),
    "gallery/setcover.response.json" -> (() =>
      assertRoundTrip[CoverView]("gallery/setcover.response.json")),
    "gallery/upload.response.json" -> (() =>
      assertRoundTrip[UploadPhotosResponse]("gallery/upload.response.json")),
    "curation/suggestthemes.response.json" -> (() =>
      assertRoundTrip[ThemeSuggestionsResponse]("curation/suggestthemes.response.json")),
    "curation/refinecuration.response.json" -> (() =>
      assertRoundTrip[RefineCurationResponse]("curation/refinecuration.response.json")),
    "curation/getchathistory.response.json" -> (() =>
      assertRoundTrip[ChatHistoryResponse]("curation/getchathistory.response.json")),
    "scene/generatescene.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/generatescene.response.json")),
    "scene/getscenerun.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/getscenerun.response.json")),
    "scene/reviewscene.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/reviewscene.response.json")),
    "scene/cancelscene.response.json" -> (() =>
      assertRoundTrip[SceneRunView]("scene/cancelscene.response.json")),
    "gallery/publish.response.json" -> (() =>
      assertRoundTrip[PublishExhibitionResponse]("gallery/publish.response.json")),
    "gallery/getpublishedexhibition.response.json" -> (() =>
      assertRoundTrip[PublicExhibitionView]("gallery/getpublishedexhibition.response.json")),
    "gallery/setphotolocation.response.json" -> (() =>
      assertRoundTrip[PhotoLocationView]("gallery/setphotolocation.response.json")),
    "gallery/clearphotolocation.response.json" -> (() =>
      assertRoundTrip[EmptyResponse]("gallery/clearphotolocation.response.json")),
    "gallery/searchplaces.response.json" -> (() =>
      assertRoundTrip[PlaceSearchResponse]("gallery/searchplaces.response.json")),
    "gallery/coverrenderupload.response.json" -> (() =>
      assertRoundTrip[CoverRenderUploadResponse]("gallery/coverrenderupload.response.json")),
    "gallery/createcontributioninvite.response.json" -> (() =>
      assertRoundTrip[ContributionInviteCreated]("gallery/createcontributioninvite.response.json")),
    "gallery/createcontribution.response.json" -> (() =>
      assertRoundTrip[ContributionSummary]("gallery/createcontribution.response.json")),
    "gallery/declinecontribution.response.json" -> (() =>
      assertRoundTrip[ContributionSummary]("gallery/declinecontribution.response.json")),
    "gallery/getcontributionmanagement.response.json" -> (() =>
      assertRoundTrip[ContributionManagementResponse]("gallery/getcontributionmanagement.response.json")),
    "gallery/closecontributioninvite.response.json" -> (() =>
      assertRoundTrip[ContributionInviteSummary]("gallery/closecontributioninvite.response.json")),
    "gallery/getcontributioninvite.response.json" -> (() =>
      assertRoundTrip[ContributionInvitePreview]("gallery/getcontributioninvite.response.json")),
    "gallery/joincontribution.response.json" -> (() =>
      assertRoundTrip[ContributionMembershipView]("gallery/joincontribution.response.json")),
    "gallery/revokecontributor.response.json" -> (() =>
      assertRoundTrip[EmptyResponse]("gallery/revokecontributor.response.json")),
    "gallery/listcontributions.response.json" -> (() =>
      assertRoundTrip[ContributionsResponse]("gallery/listcontributions.response.json")),
    "gallery/updatecontribution.response.json" -> (() =>
      assertRoundTrip[ContributionSummary]("gallery/updatecontribution.response.json")),
    "gallery/withdrawcontribution.response.json" -> (() =>
      assertRoundTrip[EmptyResponse]("gallery/withdrawcontribution.response.json")),
    "gallery/adoptcontribution.response.json" -> (() =>
      assertRoundTrip[ContributionAdoptionView]("gallery/adoptcontribution.response.json")),
    "gallery/removememory.response.json" -> (() =>
      assertRoundTrip[EmptyResponse]("gallery/removememory.response.json")),
    "gallery/contributionupload.response.json" -> (() =>
      assertRoundTrip[ContributionUploadResponse]("gallery/contributionupload.response.json")),
    "scene/getpublishedscene.response.json" -> (() =>
      assertRoundTrip[PublishedSceneResponse]("scene/getpublishedscene.response.json"))
  )

  /** request 样例：路由 -> 用对应请求类型验证可解码。 */
  private val requestChecks: Map[String, () => Unit] = Map(
    "users/register.request.json" -> (() => assertDecodes[RegisterRequest]("users/register.request.json")),
    "users/login.request.json" -> (() => assertDecodes[LoginRequest]("users/login.request.json")),
    "users/updatemyprofile.request.json" -> (() =>
      assertDecodes[UpdateMyProfileRequest]("users/updatemyprofile.request.json")),
    "users/changepassword.request.json" -> (() =>
      assertDecodes[ChangePasswordRequest]("users/changepassword.request.json")),
    "gallery/getauthorpage.request.json" -> (() =>
      assertDecodes[GetAuthorPageRequest]("gallery/getauthorpage.request.json")),
    "curation/getphotoinsights.request.json" -> (() =>
      assertDecodes[GetPhotoInsightsRequest]("curation/getphotoinsights.request.json")),
    "curation/suggestphotolocation.request.json" -> (() =>
      assertDecodes[SuggestPhotoLocationRequest]("curation/suggestphotolocation.request.json")),
    "curation/getphotolocationcandidates.request.json" -> (() =>
      assertDecodes[GetPhotoLocationCandidatesRequest]("curation/getphotolocationcandidates.request.json")),
    "curation/confirmphotolocationcandidate.request.json" -> (() =>
      assertDecodes[ConfirmPhotoLocationCandidateRequest]("curation/confirmphotolocationcandidate.request.json")),
    "scene/listsceneruns.request.json" -> (() =>
      assertDecodes[ListSceneRunsRequest]("scene/listsceneruns.request.json")),
    "scene/getscenerunbyid.request.json" -> (() =>
      assertDecodes[GetSceneRunByIdRequest]("scene/getscenerunbyid.request.json")),
    "scene/restorescenerun.request.json" -> (() =>
      assertDecodes[RestoreSceneRunRequest]("scene/restorescenerun.request.json")),
    "scene/revisescene.request.json" -> (() =>
      assertDecodes[ReviseSceneRequest]("scene/revisescene.request.json")),
    "scene/acceptscenerun.request.json" -> (() =>
      assertDecodes[AcceptSceneRunRequest]("scene/acceptscenerun.request.json")),
    "scene/dismissscenerun.request.json" -> (() =>
      assertDecodes[DismissSceneRunRequest]("scene/dismissscenerun.request.json")),
    "gallery/createexhibition.request.json" -> (() =>
      assertDecodes[CreateExhibitionRequest]("gallery/createexhibition.request.json")),
    "gallery/getexhibition.request.json" -> (() =>
      assertDecodes[GetExhibitionRequest]("gallery/getexhibition.request.json")),
    "gallery/updateexhibitionmeta.request.json" -> (() =>
      assertDecodes[UpdateExhibitionMetaRequest]("gallery/updateexhibitionmeta.request.json")),
    "gallery/updatecuration.request.json" -> (() =>
      assertDecodes[UpdateCurationRequest]("gallery/updatecuration.request.json")),
    "gallery/deletephoto.request.json" -> (() =>
      assertDecodes[DeletePhotoRequest]("gallery/deletephoto.request.json")),
    "gallery/deleteexhibition.request.json" -> (() =>
      assertDecodes[DeleteExhibitionRequest]("gallery/deleteexhibition.request.json")),
    "gallery/setcover.request.json" -> (() =>
      assertDecodes[SetCoverRequest]("gallery/setcover.request.json")),
    "curation/suggestthemes.request.json" -> (() =>
      assertDecodes[SuggestThemesRequest]("curation/suggestthemes.request.json")),
    "curation/refinecuration.request.json" -> (() =>
      assertDecodes[RefineCurationRequest]("curation/refinecuration.request.json")),
    "curation/getchathistory.request.json" -> (() =>
      assertDecodes[GetChatHistoryRequest]("curation/getchathistory.request.json")),
    "scene/generatescene.request.json" -> (() =>
      assertDecodes[GenerateSceneRequest]("scene/generatescene.request.json")),
    "scene/getscenerun.request.json" -> (() =>
      assertDecodes[GetSceneRunRequest]("scene/getscenerun.request.json")),
    "scene/reviewscene.request.json" -> (() =>
      assertDecodes[ReviewSceneRequest]("scene/reviewscene.request.json")),
    "scene/cancelscene.request.json" -> (() =>
      assertDecodes[CancelSceneRequest]("scene/cancelscene.request.json")),
    "gallery/publish.request.json" -> (() =>
      assertDecodes[PublishExhibitionRequest]("gallery/publish.request.json")),
    "gallery/getpublishedexhibition.request.json" -> (() =>
      assertDecodes[GetPublishedExhibitionRequest]("gallery/getpublishedexhibition.request.json")),
    "gallery/setphotolocation.request.json" -> (() =>
      assertDecodes[SetPhotoLocationRequest]("gallery/setphotolocation.request.json")),
    "gallery/clearphotolocation.request.json" -> (() =>
      assertDecodes[ClearPhotoLocationRequest]("gallery/clearphotolocation.request.json")),
    "gallery/searchplaces.request.json" -> (() =>
      assertDecodes[SearchPlacesRequest]("gallery/searchplaces.request.json")),
    "gallery/createcontributioninvite.request.json" -> (() =>
      assertDecodes[CreateContributionInviteRequest]("gallery/createcontributioninvite.request.json")),
    "gallery/createcontribution.request.json" -> (() =>
      assertDecodes[CreateContributionRequest]("gallery/createcontribution.request.json")),
    "gallery/declinecontribution.request.json" -> (() =>
      assertDecodes[DeclineContributionRequest]("gallery/declinecontribution.request.json")),
    "gallery/getcontributionmanagement.request.json" -> (() =>
      assertDecodes[GetContributionManagementRequest]("gallery/getcontributionmanagement.request.json")),
    "gallery/closecontributioninvite.request.json" -> (() =>
      assertDecodes[CloseContributionInviteRequest]("gallery/closecontributioninvite.request.json")),
    "gallery/getcontributioninvite.request.json" -> (() =>
      assertDecodes[GetContributionInviteRequest]("gallery/getcontributioninvite.request.json")),
    "gallery/joincontribution.request.json" -> (() =>
      assertDecodes[JoinContributionRequest]("gallery/joincontribution.request.json")),
    "gallery/revokecontributor.request.json" -> (() =>
      assertDecodes[RevokeContributorRequest]("gallery/revokecontributor.request.json")),
    "gallery/listcontributions.request.json" -> (() =>
      assertDecodes[ListContributionsRequest]("gallery/listcontributions.request.json")),
    "gallery/updatecontribution.request.json" -> (() =>
      assertDecodes[UpdateContributionRequest]("gallery/updatecontribution.request.json")),
    "gallery/withdrawcontribution.request.json" -> (() =>
      assertDecodes[WithdrawContributionRequest]("gallery/withdrawcontribution.request.json")),
    "gallery/adoptcontribution.request.json" -> (() =>
      assertDecodes[AdoptContributionRequest]("gallery/adoptcontribution.request.json")),
    "gallery/removememory.request.json" -> (() =>
      assertDecodes[RemoveMemoryRequest]("gallery/removememory.request.json")),
    "scene/getpublishedscene.request.json" -> (() =>
      assertDecodes[GetPublishedSceneRequest]("scene/getpublishedscene.request.json"))
  )

  test("契约样例目录存在且非空") {
    assert(
      Files.isDirectory(contractsRoot),
      s"找不到 docs/contracts（当前工作目录：${Paths.get("").toAbsolutePath}）"
    )
    assert(listFixtures(".response.json").nonEmpty, "docs/contracts 下没有任何 response 样例")
    assert(listFixtures(".request.json").nonEmpty, "docs/contracts 下没有任何 request 样例")
  }

  registerFixtureTests("response", ".response.json", responseChecks)
  registerFixtureTests("request", ".request.json", requestChecks)

  test("契约样例覆盖状态：已接入服务之外的样例只属于待接入服务") {
    val allowedPendingServices = Set("gallery", "curation", "scene")
    val pendingServices = listFixtures(".json")
      .map(file => serviceOf(relativePath(file)))
      .distinct
      .filterNot(typedServices.contains)
    assert(
      pendingServices.forall(allowedPendingServices.contains),
      s"存在未接入类型化校验的未知服务样例：${pendingServices.mkString(", ")}"
    )
  }

  test("待接入 fixture 清单与登记保持同步（D5/D6）") {
    assert(pendingFixtures.isEmpty, s"D6 起 pendingFixtures 必须为空，当前仍有：${pendingFixtures.mkString(", ")}")
    val missingFixtures = pendingFixtures.filterNot(key => Files.isRegularFile(contractsRoot.resolve(key)))
    assert(missingFixtures.isEmpty, s"待接入清单中的样例不存在：${missingFixtures.mkString(", ")}")
    val registered = pendingFixtures.filter(key => responseChecks.contains(key) || requestChecks.contains(key))
    assert(registered.isEmpty, s"已登记类型化校验，请从 pendingFixtures 移除：${registered.mkString(", ")}")
  }

  test("封面渲染上传样例的 renderKey 是裸 UUID") {
    val json = readFixtureJson("gallery/coverrenderupload.response.json")
    val key = json.hcursor.get[String]("renderKey").fold(error => fail(error.message), identity)
    assert(Try(UUID.fromString(key)).toOption.exists(_.toString.equalsIgnoreCase(key)))
  }
  /** response 样例：decode 成功 → encode → 与样例 JSON 对象等价。 */
  private def assertRoundTrip[A: Decoder: Encoder](relativePath: String): Unit =
    val sampleJson = readFixtureJson(relativePath)
    val decoded = summon[Decoder[A]]
      .decodeJson(sampleJson)
      .fold(
        error => fail(s"$relativePath：解码失败（字段与 api-contract 不一致）：${error.message}"),
        identity
      )
    val encoded = summon[Encoder[A]].apply(decoded)
    jsonDiff(encoded, sampleJson, "$") match
      case Some(problem) => fail(s"$relativePath：编码结果与样例不等价：$problem")
      case None => ()

  /** request 样例：对应 Decoder 必须解码成功。 */
  private def assertDecodes[A: Decoder](relativePath: String): Unit =
    val sampleJson = readFixtureJson(relativePath)
    summon[Decoder[A]]
      .decodeJson(sampleJson)
      .fold(
        error => fail(s"$relativePath：解码失败（字段与 api-contract 不一致）：${error.message}"),
        _ => ()
      )

  private def registerFixtureTests(
      label: String,
      suffix: String,
      checks: Map[String, () => Unit]
  ): Unit =
    listFixtures(suffix)
      .filter(file => typedServices.contains(serviceOf(relativePath(file))))
      .filterNot(file => pendingFixtures.contains(relativePath(file)))
      .foreach { file =>
        val key = relativePath(file)
        checks.get(key) match
          case Some(check) => test(s"$label $key：契约形状符合") { check() }
          case None =>
            test(s"$label $key：已登记契约校验") {
              fail(s"$key：未在 ContractFixtureSpec 登记对应类型；新增契约样例时必须同时登记 Decoder/Encoder 校验")
            }
      }

  private def serviceOf(relativePath: String): String =
    relativePath.takeWhile(_ != '/')

  private def listFixtures(suffix: String): List[Path] =
    if !Files.isDirectory(contractsRoot) then Nil
    else
      Using.resource(Files.walk(contractsRoot)) { stream =>
        stream
          .iterator()
          .asScala
          .filter(path => Files.isRegularFile(path))
          .filter(path => path.getFileName.toString.endsWith(suffix))
          .toList
          .sortBy(_.toString)
      }

  private def relativePath(file: Path): String =
    contractsRoot.relativize(file).toString.replace('\\', '/')

  private def readFixtureJson(relativePath: String): Json =
    val file = contractsRoot.resolve(relativePath)
    assert(Files.isRegularFile(file), s"契约样例不存在：$relativePath（契约根：$contractsRoot）")
    parse(Files.readString(file)).fold(
      error => fail(s"$relativePath：不是合法 JSON：${error.message}"),
      identity
    )

  /** 按对象等价比较两份 JSON：键顺序无关、数组有序、数值浮点容差、null 必须显式存在。 */
  private def jsonDiff(actual: Json, expected: Json, path: String): Option[String] =
    (actual.asObject, expected.asObject) match
      case (Some(actualFields), Some(expectedFields)) => objectDiff(actualFields, expectedFields, path)
      case _ =>
        (actual.asArray, expected.asArray) match
          case (Some(actualItems), Some(expectedItems)) => arrayDiff(actualItems, expectedItems, path)
          case _ =>
            (actual.asNumber, expected.asNumber) match
              case (Some(actualNumber), Some(expectedNumber)) => numberDiff(actualNumber, expectedNumber, path)
              case _ if actual.isNull && expected.isNull => None
              case _ if actual == expected => None
              case _ => Some(s"$path 值不一致：${actual.noSpaces} != ${expected.noSpaces}")

  /** 对象：键集合必须完全一致（缺字段/多字段都失败，Option 编码为 null 时字段不能省），再逐字段比较。 */
  private def objectDiff(actual: JsonObject, expected: JsonObject, path: String): Option[String] =
    val missing = expected.keys.toSet -- actual.keys.toSet
    val unexpected = actual.keys.toSet -- expected.keys.toSet
    if missing.nonEmpty then Some(s"$path 缺少字段：${missing.toList.sorted.mkString(", ")}")
    else if unexpected.nonEmpty then Some(s"$path 多出字段：${unexpected.toList.sorted.mkString(", ")}")
    else
      expected.toList
        .flatMap { case (field, expectedValue) =>
          actual(field) match
            case Some(actualValue) => jsonDiff(actualValue, expectedValue, s"$path.$field")
            case None => Some(s"$path 缺少字段：$field")
        }
        .headOption

  /** 数组：长度与顺序都有意义。 */
  private def arrayDiff(actualItems: Vector[Json], expectedItems: Vector[Json], path: String): Option[String] =
    if actualItems.size != expectedItems.size then
      Some(s"$path 数组长度 ${actualItems.size} != ${expectedItems.size}")
    else
      actualItems
        .zip(expectedItems)
        .zipWithIndex
        .flatMap { case ((actualItem, expectedItem), index) => jsonDiff(actualItem, expectedItem, s"$path[$index]") }
        .headOption

  private def numberDiff(actual: JsonNumber, expected: JsonNumber, path: String): Option[String] =
    if numbersEquivalent(actual, expected) then None
    else Some(s"$path 数值不一致：$actual != $expected")

  /** 数值等价：整数精确比较；小数允许相对 1e-9 的浮点容差。 */
  private def numbersEquivalent(actual: JsonNumber, expected: JsonNumber): Boolean =
    (actual.toBigDecimal, expected.toBigDecimal) match
      case (Some(actualValue), Some(expectedValue)) =>
        val difference = (actualValue - expectedValue).abs
        val scale = actualValue.abs.max(expectedValue.abs).max(BigDecimal(1))
        difference <= scale * BigDecimal("1e-9")
      case _ => actual == expected
