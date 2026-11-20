# 项目规范

## 技术栈

- **前端**：TypeScript + React
- **后端**：Scala

## 代码风格总则

生成代码时遵循三大原则：**声明式编程、函数式编程、类型安全**。

- 描述"做什么"而非"怎么做"，优先表达式而非语句。
- 优先纯函数与不可变数据，用组合子组合逻辑，而非副作用和命令式控制流。
- 充分利用类型系统，避免绕过或削弱类型的写法。

## Scala

- 尽量用 `val`，不用 `var`。
- 尽量不用 for 循环；用 `map` / `flatMap` / `filter` / `fold` 等集合组合子替代命令式遍历。

## 课程规范（lec3 课件）

- 错误处理不使用 `try` / `catch` / `finally`（类型不安全）；可能缺失的值用 `Option[T]`，可能失败的计算用 `Try[T]`，用 `map` / `flatMap` / for 推导式组合。
- 程序 main 入口定义在 `object` 中（`def main(args: Array[String])`）；`object` 仅表示单例，领域建模所说的"对象"一律是 `case class`。
- 定义数据模型优先用 `case class`（字段不可变）；有限的固定取值集合用 `enum`（可带参数）；抽象概念用 `abstract class`；可复用的能力/特性用 `trait`。
- 领域建模：先找出系统中最根本的元素定义为领域类型，再用它们组合出复杂类型；不要拿 `Int` / `String` 等基础类型直接充当领域对象。
- 函数式架构：核心逻辑只写纯函数（结果只依赖输入、确定性、无副作用）；副作用（读写数据库、服务器通信等）全部装进 `IO` 盒子（Monad），用 `flatMap` 粘合成"计划"，执行交给边缘/框架。
- 并发使用 Cats Effect 的 Fiber（轻量，每机可跑百万个），每个 fiber 运行一个 `IO`；`IO[_]` 即 Monad。

## TypeScript

- 同样遵循总则：优先 `const`，避免 `let` 与可变状态；用 `map` / `filter` / `reduce` 等替代命令式循环。
- 严格类型：不使用 `any`，不确定的类型用 `unknown` 并做类型收窄。

## 课程规范（lec4 课件）

- 微服务拆分：复杂后端拆成小微服务，每个微服务明确三要素——名字（定位）、数据库、API；拆分原则为高内聚（内部联系强）、低耦合（外部连接弱）。
- 序列化：微服务间只能传字符串；序列化=对象→字符串，反序列化=字符串→对象；用 Circe 半自动派生（`implicit val xEncoder: Encoder[T] = deriveEncoder` 等）。
- 数据库：列强类型、只有基本类型；每表推荐有主键，跨表引用用外键；基础类型直接存，复杂类型序列化成 TEXT（或 JSON）便于阅读检索。
- 前端 MVC：View 是数据的纯函数（不可变）；数据分三类——常数、核心数据（hooks 定义、随时间变化）、展示型数据（由核心数据计算而来、不可变）；核心数据要尽可能少，前端"只是在修改核心数据而已"。
- 函数与组件：纯函数不返回 HTML、无副作用；组件返回 HTML、有副作用，须推到边缘（hooks/`useEffect`）；全项目没有全局变量（有时间维度）。
- Zustand：只存多个页面共享的全局核心数据；纯函数中禁用 `useXXX`（函数没有时间概念），组件中禁用 `getXXX`（组件取值应随时间自动更新）；store 保持私有，只公开 `use`/`set`/`get` 函数，并用长而清晰的名字防止滥用。
- 跨页面传数据：全局核心数据走 Zustand；页面级参数走组件函数参数；跳转携带走 Location（`useLocation`）。
- 页面拆分：页面代码过长必须拆开（便于阅读，AI 处理更快更便宜）；采用模块化拆分——每个模块一个文件，文件内可同时含 html/css/js。
- CSS：结构与样式分离；一维布局用 Flexbox（导航栏、按钮组），二维布局用 Grid（照片墙等矩阵）；样式用 Tailwind（类名写在 JSX 里，不单独写 css 文件，对 AI 友好）；构建用 Vite（增量编译）。

## 前后端接口对齐

- 契约先行：前后端共同遵循一份接口契约，每个接口明确五要素——路径、HTTP 方法、请求类型、响应类型、错误语义；前端调用的每个接口后端必须有对应实现，反之亦然，任何一侧不允许私自增删改接口。
- 类型两侧一致：每个接口的请求/响应数据类型，后端定义为 `case class`（配 Circe `Encoder`/`Decoder`），前端定义同构的 TS `interface`/`type`；字段名、字段类型、可空性（`Option[T]` ↔ `T | null`）与序列化格式（字段命名风格、日期时间格式）逐字段对齐。
- 同步演化：修改接口（增删字段、改路径、改语义）时前后端在同一次修改中一起更新，保持契约不漂移；维护一份接口清单（路径、方法、请求/响应类型、错误码）作为两侧对齐的基准。
- 错误也属于契约：失败响应的结构（错误码/错误信息字段）同样要有类型定义，前端按类型处理错误，不靠猜字符串。

## 工程结构规范（消息驱动 API，完整 60 条见根目录 rules.md）

后端（services/ 模型）：

- 目录：`services/<service>/{api,objects,routes,tables,utils}`，共享基础设施集中到 `services/system/`；新增目录需说明理由。
- 调用边界只有两种：公开 API 消息的 `plan`、公开 Table 方法；跨服务不套只做转发的 Service 层。SQL 值、行映射、utils 一律私有（utils 用 `private[service名] def`），封装不可被绕过。
- API 消息：一 API 一文件；`final case class` 构造参数即业务输入；继承 `APIMessage[Response]` 或无请求的 `NoRequestMessage[Response]`；`plan(connection): IO[Response]` 是唯一公共执行入口；副作用全部显式组合在 IO 中；按真实依赖建模，不默认注入 Context，不建空请求类；API 类别保持精简。
- 权限与信任边界：身份/角色/会话/令牌归用户（账户）服务；前端 userToken 由路由器校验解析成可信 userId 后才构造消息，前端自报身份不可信；为此前后端消息允许有意不同（与"类型两侧一致"不冲突——信任边界处的差异是设计出来的）。
- 路由器：精简声明式（分发、反序列化、令牌转换、构造消息、执行 plan、序列化），不含业务逻辑；每服务一个 `XXRoutes`，顶层合并注册列表；路由名从消息类型名统一推导，前后端必须用同一命名规则。
- objects/：纯数据结构+序列化（无业务行为、无 DB 访问、无随机 ID）；`final case class` + 同文件伴生对象中 `given Encoder/Decoder`；一对象一文件（拒绝大型 Models.scala）；枚举序列化简单（toString/fromString 足够，转换与编解码放伴生对象，Encoder 复用 toString）；有限固定状态用封闭类型（enum/sealed trait/字面量联合）；import 放文件顶部；API 传输类型放 `objects/apiTypes/`，每 API 一个响应结构。
- tables/：一表一文件夹（`XXTable.scala` 定义 + `XXTableInitializer.scala` 建表初始化）；表归其最早出现的服务；SQL val 私有、放对应 def 之前、成对相邻；表函数返回 `IO[T]`、不含业务逻辑（复杂逻辑上移 API 或 utils）。

前端（TS+React）：

- 共享 `components/` 只放可广泛复用的 UI 基础组件；页面专用代码（组件/hooks/objects/functions/stores）就近放页面文件夹；复杂页面按可见业务区域拆分，`index.tsx` 保持可见骨架、不用模糊布局包装器掩盖主结构；只有复杂度确实需要时才递归拆分，拒绝形式化模块化。
- `apis/` 按后端服务边界对应组织；面向前端的 API 前后端文件一一对应；通用 API 基础设施（令牌存储、名称计算、发送逻辑、基类）放服务文件夹之外并按职责拆分；前端 API 类只含输入字段和 `send()`；apiName 用共享工具统一推导，防命名漂移。
- 复杂页面状态显式建模为判别联合（loading/ready/empty/error/submitting），简单表单保持简单，不为理论优雅引入庞大联合类型。

工程卫生：移除未使用的脚手架/资源/库文件；坚持 Tailwind、避免自定义 CSS；文件夹名传达用途；文档产物与源码分离。

本机诊断脚本和日志可放在被忽略的 `backend/target/`，长期本机资料可放在 `.local/`。正式测试和合成素材放在测试目录。
