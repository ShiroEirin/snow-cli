# 变更提案: vcp-five-layer-boundary-correction

## 元信息
```yaml
类型: 架构边界修正/协议职责回收
方案类型: implementation
优先级: P0
状态: 已创建
创建: 2026-03-28
更新: 2026-03-31 20:43
```

---

## 1. 需求

### 背景
当前 `Snow CLI + SnowBridge + VCPToolBox` 已经做出了“五层隔离架构”的雏形，但基于当前分支代码与相关提交的重型复核，仍有 5 个关键偏层点没有收干净。

本方案在范围上进一步收口：

- 主实施面固定为 `snow-cli + SnowBridge`
- `VCPToolBox` 不作为主改造面
- 只有在确认当前仓库里已经残留了 Snow 专属越界清洗时，才允许对 `VCPToolBox` 做“回退到最薄识别层”的修正
- 不新增对 `VCPToolBox` 主链的深层依赖改造
- 新增优化项仍然遵守同一边界：若要强化 `SnowBridge` 白名单，只允许通过 `Snow CLI -> SnowBridge` 的统一来源标识与最薄校验实现，不把协议识别扩散回 `Snow Core` 或 `VCPToolBox` 主聊天链

1. 模型层仍可能直接看到旧 VCP 协议母语，例如 `TOOL_REQUEST`、`tool_name:「始」...「末」`、调用格式示例。
2. 翻译层的一部分职责落进了 `VCPToolBox` 主链，并开始裁剪 prompt 自然语言语义，而不只是条件禁用 legacy 注入。
3. 执行层仍在自己做路由决策，`toolExecutor` 直接判断本次到底走 `local` 还是 `bridge`。
4. `Snow Core` 对 bridge 侧仍有较强直接感知，`conversationSetup` 直接拿 manifest、建 snapshot、清 snapshot。

5. `SnowBridge` 插件当前同时承担了“桥接原始导出”和“模型面描述净化”的混合职责，但命令级 `description/example/invocationCommands` 仍然原样透出，导致边界既不彻底，也不清晰。按目标边界，`SnowBridge` 不应直接产出模型面描述，只应导出供 Snow translator 消费的原始桥接信息。

进一步按“代码真实性基准”复核后，还确认了文档与测试层面的漂移：

6. 当前部分测试仍在固化旧边界。例如 `toolSnapshot.test.ts` 仍将“从 `description` 正文反推参数”视为正确行为，`toolRouteArbiter.test.ts` 仍将执行层自行判路由视为正常路径。这意味着如果只改实现而不同步测试，后续很容易被旧测试和旧认知反向拉回。

同时也确认了当前已经站稳、原则上应保留的兼容能力：

- `x-snow-client / x-snow-protocol / x-snow-tool-mode` 请求头边界
- `::Time` outbound request bridge
- `local / bridge / hybrid` 的注册裁决方向
- `local > bridge` 的冲突优先级
- `VCP元思考链 / TOOL_REQUEST / TOOL_RESULT / ROLE_DIVIDE` 的显示层兼容

这 5 个点共同说明：

- 当前代码不是“完全错误”，而是边界已经初步成型，但协议翻译、路由裁决、执行绑定三者还没有彻底拆开。
- 若继续沿当前方向在 `snow-cli` 和 `VCPToolBox` 主链里补丁式修补，会逐渐偏离“最大限度减少破坏”的长期目标。

### 目标
- 将 `Snow Core Layer` 明确限制为 `seam` 级改动：只允许接入 translator / router 的门面结果，不允许继续吸收 VCP 协议转换、VCPToolBox 感知或工具路由决策。
- 让模型层只看到统一的 function-calling 工具描述，不再直接接触旧 VCP 协议母语。
- 将协议翻译职责收回到 Snow 兼容层 / translator facade，而不是继续扩散到 `VCPToolBox` 主逻辑。
- 将工具执行绑定前移到路由层，使执行层只负责“按绑定执行”。
- 将 `Snow Core` 对 bridge manifest 生命周期的直接感知，收敛为兼容层门面调用。
- 明确 `SnowBridge` 插件只负责桥接原始能力导出与 execute/cancel/status，模型面工具说明清洁化全部前移到 Snow translator。
- 将本次边界修正同步到测试与方案文档，避免“代码已修、测试仍在验证旧行为”的二次漂移。
- 将 `VCPToolBox` 的目标严格限制为“零新增主链改造”；若必须触碰，也仅限撤销已存在的越界 Snow 专属清洗。
- 为 `SnowBridge` 增加 Snow-only 访问隔离能力：只有带明确 Snow 来源标识的 bridge 请求才能访问，避免与 `VCPToolBridge` 或其他分布式客户端竞争同类 WS 桥接消息。
- 在 `1.0` 前增加一轮“兼容治理审计”：把当前真实兼容面明确固化为 `语法保真 / Outbound ::Time / Tool Plane / Response Display / Session Policy` 五组事实，防止文档继续夸写超出代码真实性的能力。
- 为云端/远端 `VCPToolBox` 场景预留 `SnowBridge` 远程 WS 地址覆盖能力，但不破坏当前 `baseUrl + bridgeVcpKey` 本地推导与 Snow-only 来源契约。
- 保留已经正确的能力：
  - `x-snow-*` 请求标识
  - `::Time` outbound bridge
  - `local / bridge / hybrid` 的注册裁决方向
  - `local > bridge` 的冲突优先级
  - VCP 显示层折叠/转录兼容

### 约束条件
```yaml
Snow CLI 约束:
  - 不继续深改 provider 主链与非 VCP 模式路径
  - `Snow Core Layer` 只允许 seam 级改动
  - 不让 core 直接承担协议翻译职责
  - 不让 core 深度感知 `VCPToolBox` / `SnowBridge` 底层细节
  - 不让 core 持有工具路由决策逻辑
  - 不让 executor 继续持有路由判断
VCPToolBox 约束:
  - 不作为本次主实施面
  - 不新增深层核心改造
  - 若当前代码中已存在 Snow 专属越界清洗，只允许回退到最薄识别层
  - 不继续扩展正则式 prompt 语义裁剪
SnowBridge 约束:
  - 保持窄职责：raw manifest / execute / cancel / status
  - 不再承担完整的模型面协议清洗主责
  - 不直接产出模型面工具描述
  - 新增白名单优化时，只允许消费 Snow 显式声明的来源标识，不引入新的 prompt/messageProcessor 级协议注入
  - 若保留最小净化，也只能做薄净化，不能继续混入 translator 级逻辑
兼容约束:
  - 不破坏 VCP 自身 legacy 前端
  - 不破坏 native mode 与非 VCP 模式
文档/测试约束:
  - 以当前代码真实行为为基准更新方案包
  - 涉及边界迁移的测试必须同步修正，不能继续固化旧职责分层
```

### 验收标准
- [ ] 模型层看到的 bridge 工具描述中不再包含 `TOOL_REQUEST`、`始/末`、调用格式示例。
- [ ] `VCPToolBox` 不再承担 prompt 语义清洗，只保留 header 识别与最薄的 legacy 注入禁用。
- [ ] `toolExecutor` 不再直接调用路由决策函数来判断 `local / bridge`。
- [ ] `conversationSetup` 不再直接拼装 bridge manifest 生命周期细节，而是通过兼容层 facade 获取“已处理好的桥接工具面”。
- [ ] `SnowBridge` 插件的职责边界清晰：桥接原始能力导出与执行协议保留，模型面清洁化主责前移到 Snow translator。
- [ ] 相关测试与方案文档不再固化旧边界，能够反映修正后的真实职责划分。
- [ ] `vcp + local / bridge / hybrid` 三种模式黑盒行为与五层职责定义一致。
- [ ] `SnowBridge` 仅接受带 Snow 专属来源标识的 WS bridge 请求；未标识或非 Snow 请求会被拒绝，不再和 `VCPToolBridge` 竞争同类消息。
- [ ] 普通 assistant 无工具路径中，最终 UI、`conversationMessages` 与 session 持久化前统一使用 `sanitizeAssistantContent()` 后正文。
- [ ] `vcp-blackbox` 支持显式 `workDir/config` fixture，并在 SSE `complete` 后同时校验 tool result、final assistant reply、重复工具调用与协议泄漏。

---

## 2. 方案

### 推荐方案
采用 **Snow 侧主修复 + Bridge 窄职责化 + 后端最小触碰** 方案：

0. **Snow Core 只保留 seam**
   - `Snow Core Layer` 只接 translator / router 的结果，不消费 VCP 协议细节。
   - 所有新增复杂逻辑都落在 `source/utils/session/vcpCompatibility/*`，而不是回灌到 conversation 主流程。

1. **模型层清洁化**
   - 旧协议母语不再通过 `SnowBridge manifest -> toolSnapshot -> model tool description` 这条链路上浮。
   - 模型只接收结构化、function-calling 友好的工具说明。
   - 模型层不能再看到 `TOOL_REQUEST`、`tool_name`、`始/末`、调用格式示例、bridge transport 细节字段。

2. **翻译层前移**
   - 把“面向模型的描述净化”和“桥接 raw manifest 到 model tools 的结构转换”放进 `snow-cli/source/utils/session/vcpCompatibility/*`。
   - `VCPToolBox` 不是主修复面；如当前已被写入 Snow 专属清洗，只允许回收到“最薄识别”。

3. **路由层绑定化**
   - 路由层不仅决定“该走谁”，还产出执行绑定（例如 local-binding / bridge-binding）。
   - 执行层只消费绑定，不再自己判断 route。

4. **Core 侧门面化**
   - `conversationSetup` 不再直连 bridge manifest 细节，而通过一个兼容层 facade 获取“本轮工具平面结果”。

5. **桥接层窄职责化**
   - `SnowBridge` 只保留桥接传输、manifest 原始导出、execute/cancel/status、async callback/status 事件。
   - 不再把“模型面协议清洁化”长期压在插件内部实现。

### 为什么不是继续补 VCPToolBox 正则
- 正则式 prompt 清洗虽然短期有效，但它已经开始裁剪自然语言语义，不再是“条件禁 legacy 协议”，而是“修改后端 prompt 含义”。
- 这会让 `VCPToolBox` 从执行层/翻译协作层滑向协议主权层，长期会越来越难维护。
- 本方案因此把 `VCPToolBox` 的职责收紧到“尽量不动；若已被污染，则只做回退”。

### 为什么不是继续让 toolExecutor 判路由
- 一旦执行层继续感知 `local / bridge / hybrid`，五层分离在“最后一步”就破了。
- 路由层应该输出“已决策结果”，执行层只负责执行。

---

## 3. 技术设计

### A. 模型层清洁化

#### 当前问题
- `toolSnapshot.ts` 会直接使用 `command.description`，必要时还从描述正文推断参数。
- `SnowBridge` 当前只清洗了插件顶层 `description`，命令级 `description/example/invocationCommands` 仍可能携带旧协议。
- `toolSnapshot.test.ts` 当前也把“从自由文本 description 提取参数”当作预期行为，测试口径与目标边界不一致。
- `toolSnapshot.ts` 当前还会强行向模型暴露桥接传输细节字段 `command`，导致模型工具 schema 混入执行层细节。

#### 修正方向
- 新增 bridge manifest translator：
  - 输入：SnowBridge raw manifest 原始结构
  - 输出：纯 function-calling 友好的 `BridgeModelToolDescriptor[]`
- 禁止再从命令描述正文反推 legacy 协议结构。
- 禁止再把桥接 transport 所需的固定 `command` 字段暴露给模型层 schema。
- 参数来源优先级：
  1. manifest 结构化参数
  2. translator 补的最小 schema
  3. 无结构化参数时，退回宽松对象 schema，但不再解析旧协议示例文本

#### 建议位置
- `snow-cli/source/utils/session/vcpCompatibility/bridgeManifestTranslator.ts`

### B. 翻译层职责回收

#### 当前问题
- `VCPToolBox/messageProcessor.js` 已开始做 prompt 自然语言清洗，超出薄识别层职责。

#### 修正方向
- 首选路径：
  - 不继续扩展 `VCPToolBox`
  - 将“模型可见工具描述净化”完全移到 Snow translator
- 仅当当前代码里已存在越界逻辑时，才回退：
  - `x-snow-client / x-snow-protocol / x-snow-tool-mode` 识别保留
  - 条件禁用 `VarToolList / VarVCPGuide / TOOL_REQUEST` 一类 legacy 注入源保留
  - `关于日记`
  - `必须调用 / 优先使用 / 调用...记忆`
  等自然语言级整行裁剪规则移除

#### 建议位置
- 保留最薄识别：
  - `VCPToolBox/modules/messageProcessor.js`
  - `VCPToolBox/modules/chatCompletionHandler.js`
- 语义净化前移：
  - `snow-cli/source/utils/session/vcpCompatibility/*`

### C. 路由层绑定化

#### 当前问题
- `toolExecutor.ts` 直接依赖 `resolveToolExecutionRoute()` 与 `getBridgeToolByName()`。
- `toolRouteArbiter.test.ts` 当前也把执行层自行判路由视为正常行为，测试需要随边界修正一起迁移。
- `Snow Core Layer` 邻近文件如果继续吸收 bridge 生命周期与路由判断，会把 translator/router 的职责重新拉回核心层。

#### 修正方向
- 新增执行绑定数据结构：
  - `local`: `{kind: 'local', toolName}`
  - `bridge`: `{kind: 'bridge', toolName, pluginName, commandName, snapshotKey}`
- 路由层在准备阶段就产出绑定表。
- `toolExecutor` 只接收绑定后的执行请求，不再自己判路由。
- `Snow Core Layer` 只接收“已解析好的工具平面 / 已绑定好的执行信息”，不再读取 VCP 协议原始形态。

#### 建议位置
- 新增：
  - `snow-cli/source/utils/session/vcpCompatibility/toolExecutionBinding.ts`
- 调整：
  - `conversationSetup.ts`
  - `toolRouteArbiter.ts`
  - `toolExecutor.ts`

### D. Core 侧门面化

#### 当前问题
- `conversationSetup.ts` 直接管理 bridge client / snapshot 生命周期。
- 如果继续在 `conversationSetup.ts` 堆叠 VCP 兼容逻辑，就会把 Snow Core 从接缝层推回协议协调层。

#### 修正方向
- 新增 facade：
  - 负责根据配置拉取 bridge manifest
  - 调用 manifest translator
  - 产出 session snapshot 与服务信息
  - 在 `local` 模式统一清理 bridge snapshot
- `conversationSetup` 只消费 facade 返回结果，不直接接触底层 bridge client。
- `conversationSetup` 的允许改动范围仅限 seam 级接线，不允许继续增长协议分支判断和 VCP 特例逻辑。

#### 建议位置
- 新增：
  - `snow-cli/source/utils/session/vcpCompatibility/toolPlaneFacade.ts`

### E. SnowBridge 插件边界修正

#### 当前问题
- `SnowBridge/index.js` 当前既在做桥接 transport，又在尝试做模型面 description 净化。
- 但它只清了插件顶层 `description`，命令级 `description/example` 和原始 `invocationCommands` 仍原样透出，边界不一致。
- 当前测试与方案文档尚未明确区分“原始桥接数据”和“模型面数据”，容易导致后续继续在错误层上修补。

#### 修正方向
- 明确区分两类数据：
  - 桥接原始数据：供 translator/facade 消费
  - 模型面数据：仅由 Snow translator 统一生成
- `SnowBridge` 插件内部如保留净化，只允许保留最低限度的安全净化，不再承担完整 translator 职责。
- `SnowBridge` 继续保持：
  - manifest 拉取
  - execute/cancel/status
  - async callback/status 透传
  - access control / rate limit

#### 建议位置
- 保留：
  - `VCPToolBox/Plugin/SnowBridge/index.js`
- 前移：
  - `snow-cli/source/utils/session/vcpCompatibility/bridgeManifestTranslator.ts`

### F. VCPToolBox 最小保留改造

#### 保留
- `requestHeaders` 透传
- `isSnowFunctionCallingRequest()` 识别
- 条件禁 legacy 占位符

#### 回退
- 所有会裁剪 prompt 自然语言含义的 Snow 专属正则
- 不让 `VCPToolBox` 继续承担“面向模型的协议清洗”

#### 执行边界
- 默认只审计，不写入 `VCPToolBox`
- 只有确认当前代码里确实残留 Snow 专属越界清洗时，才允许最小回退 `messageProcessor.js`
- `chatCompletionHandler.js` 默认视为只读核对项，不作为主改造入口

### G. 代码/测试/方案同步

#### 当前问题
- `.helloagents` 中的方案描述并不一定完全等于当前代码事实。
- 当前测试还在固化旧边界，后续若只改实现不改测试，容易发生“修正被回拉”。

#### 修正方向
- 以当前代码真实实现为准，补写“代码事实”到方案包的 `LIVE_STATUS` 与执行备注中。
- 所有与五层边界相关的测试同步调整：
  - `toolSnapshot.test.ts`
  - `toolRouteArbiter.test.ts`
  - 需要时补充 facade/binding 新测试
- 后续黑盒结论回写到方案包，避免只在对话里存在。

### H. SnowBridge Snow-only 来源校验

#### 当前问题
- `SnowBridge` 与 `VCPToolBridge` 当前都拦截 `get_vcp_manifests / execute_vcp_tool / cancel_vcp_tool` 这一类分布式 WS bridge 消息。
- 现有 `Allowed_Clients=snow-cli` 只基于 `clientInfo` 做客户端名白名单，隔离强度不足，无法表达“这是 Snow CLI 的 bridge 协议请求”。
- 如果只在插件侧做单边判断，`native/local` 与 `vcp/bridge` 的边界仍然容易依赖隐式约定，而不是显式协议标记。

#### 修正方向
- `Snow CLI` 在 `SnowBridgeClient` 发送 WS bridge 请求时补齐统一的 Snow 来源元数据，至少包括：
  - 固定客户端身份
  - 固定桥接协议标识
  - 当前工具模式（`bridge` / `hybrid`）
- `SnowBridge` 仅消费并校验这份来源元数据：
  - 未携带或不匹配 Snow 协议标识的请求，直接拒绝
  - 配置层支持显式开启/关闭 Snow-only 校验与允许的工具模式
- 这项优化只落在 bridge seam，不把识别逻辑扩散到 `messageProcessor.js` 或聊天主链。

#### 建议位置
- `snow-cli/source/utils/session/vcpCompatibility/bridgeClient.ts`
- `VCPToolBox/Plugin/SnowBridge/index.js`
- `VCPToolBox/Plugin/SnowBridge/config.env.example`
- `VCPToolBox/Plugin/SnowBridge/plugin-manifest.json`

### I. 1.0 前兼容治理与远程桥接预留

#### 当前事实
- 当前分支已经完成 `Tool Plane`、`bridge/hybrid` 访问链与 `x-snow-*` 来源契约的主体收口，但仍是 `0.8` 测试标准线，不是 `1.0` 正式完成态。
- `System Prompt 保真` 与 `Session Policy 兼容` 目前只能按“部分成立”记录；不能继续把 Snow 侧 pass-through 误写成端到端保真。
- `::Time` 仍然成立，但它现在是 `timeContextBridge.ts` 提供的“最小续问时间锚点桥接”，不是旧叙述里的完整时间语义扩写器。
- `Response Display` 兼容已具备基础事实，但 display / transcript / session 三条链路的口径仍需继续治理，避免后续再把 UI 抑制、正文净化与 session policy 混写成一个概念。

#### 治理方向
- `语法保真审计`
  - 逐项核实 `[@tag]`、`[@!tag]`、`[[...]]`、`<<...>>`、`《《...》》`、`{{Var*}}/{{Tar*}}/{{Sar*}}`、`::Group`、`::TagMemo`、`::AIMemo`、`::TimeDecay`、`::RoleValve`、`::Base64Memo` 等语法当前到底是 pass-through、部分保留，还是仅文档曾宣称支持。
- `Outbound Bridge 审计`
  - 以 `::Time` 为起点，明确 outbound request 兼容层当前真实契约，避免再把历史 VCP 前端语义映射能力直接套到 Snow translator。
- `Display 兼容审计`
  - 分开记录 `stream suppression`、`transcript transform`、`assistant/session save sanitize` 三条链，避免继续在 display 层和 session policy 层之间漂移。
- `文档与测试一致性审计`
  - 中文文档、黑盒夹具、方案包 `LIVE_STATUS` 与测试断言统一按代码事实书写，不再把 `0.8` 测试标准线写成正式版。

#### 远程 WS 地址支持边界
- `SnowBridge` 远程 WS 地址覆盖应作为后续优化项设计，而不是回退当前本地推导链。
- 默认行为继续保持：
  - 优先按 `baseUrl + bridgeVcpKey` 推导本地 bridge WS 入口
  - 自动附加 `x-snow-client / x-snow-protocol / x-snow-tool-mode / x-snow-channel=bridge-ws`
  - 保持 `SnowBridge` Snow-only 来源校验
- 只有在用户显式配置远程 WS 地址时，才允许覆盖默认推导结果。
- 即便引入远程 WS 覆盖，也不得把来源校验、协议注入或路由裁决重新回灌进 `Snow Core` 或 `VCPToolBox` 主聊天链。

---

## 4. 实施顺序

### 阶段 1: 审计并最小化处理后端残留
1. 先审计 `VCPToolBox` 是否真的还残留 Snow 专属越界清洗
2. 若存在，只回退 `messageProcessor.js` 中超出“禁 legacy 注入”范围的自然语言裁剪
3. 保留 header 识别与最薄条件禁用
4. 若不存在残留，则本阶段对 `VCPToolBox` 不做修改
5. 若后续代码复核确认 `VCPToolBox` 主链仍保留“旧协议解析重复实现”这类与 Snow 无关、但已经坐实的边界债，则允许做最小化去重修复；修复目标仅限复用既有协议层解析器，不新增 Snow 专属逻辑，也不扩散到 `snow-cli` 深层

### 阶段 2: 建立 translator/facade
1. 新建 bridge manifest translator
2. 新建 tool plane facade
3. 把 `conversationSetup` 的 bridge 细节下沉到 facade
4. 明确 `conversationSetup` 只做 seam 级接线，不新增协议转换逻辑

### 阶段 3: 路由绑定前移
1. 设计 execution binding 结构
2. 路由层产出 binding
3. executor 改为只执行 binding

### 阶段 4: 模型层清洁化
1. 明确 SnowBridge 原始导出面与模型面清洁化边界
2. translator 层统一生成模型可见 description/schema
3. 去掉 toolSnapshot 对 legacy 描述正文的依赖
4. 去掉模型 schema 中固定 `command` 之类的桥接 transport 细节
5. 如有必要，仅保留 SnowBridge 最薄的原始导出安全净化

### 阶段 5: 黑盒回归
1. `vcp + local`
2. `vcp + bridge`
3. `vcp + hybrid`
4. `native + local` 非回归校验
5. 将黑盒与测试结论同步回方案包与执行备注

### 阶段 6: 1.0 前兼容治理
1. 审计并固定 VCP 语法保真清单，区分 pass-through / suppression / 非承诺支持
2. 审计并固定 `::Time` 的最小 outbound bridge 契约
3. 审计并统一 display / transcript / session 三条兼容链的事实口径
4. 设计 `SnowBridge` 远程 WS 地址覆盖能力，并明确不回退当前 Snow-only 来源契约
5. 将治理结论同步到文档、夹具、方案包与后续黑盒入口

---

## 5. 技术决策

### vcp-five-layer-boundary-correction#D001: VCPToolBox 只保留最薄 Snow 识别层，不再承担 prompt 语义清洗
**状态**: ✅采纳

### vcp-five-layer-boundary-correction#D002: 模型可见工具描述的清洁化，必须前移到 Snow translator/facade
**状态**: ✅采纳

### vcp-five-layer-boundary-correction#D003: 路由层输出执行绑定，executor 不再自己判 route
**状态**: ✅采纳

### vcp-five-layer-boundary-correction#D004: conversationSetup 不再直接管理 SnowBridge manifest 生命周期
**状态**: ✅采纳

### vcp-five-layer-boundary-correction#D005: SnowBridge 插件保持桥接窄职责，只导出 raw manifest，模型面清洁化主责前移到 Snow translator
**状态**: ✅采纳

### vcp-five-layer-boundary-correction#D006: 边界修正必须同步更新测试与方案文档，防止旧测试固化错误层级
**状态**: ✅采纳

### vcp-five-layer-boundary-correction#D007: 已确认正确的 `::Time` / 请求头 / 显示兼容链保持不回退，只围绕越层点做收边
**状态**: ✅采纳

### vcp-five-layer-boundary-correction#D008: Snow Core Layer 只允许 seam 级改动，不得直接承担 VCP 协议转换、VCPToolBox 感知或工具路由决策
**状态**: ✅采纳

---

## 6. 交付结果
- 一份围绕“五层隔离偏层点修正”的正式实施方案
- 一套新的 translator/facade/binding 改造边界
- 一条从 `~auto` 进入实施的清晰任务顺序
- 一条明确的“后端最小触碰”实施原则

---

## 7. 2026-04-04 上游 `v0.7.6` 同步补充

### 当前事实
- 当前 `snow-cli` 正式整合到的上游基线仍是 `v0.7.5`。
- `snow-fork` 的 `v0.7.6`（`2ecc469`）与当前 `main`（`acac2d1`）之间的真实增量，主要分为四组：
  1. 并发压缩/执行稳定性：
     - `source/hooks/conversation/chatLogic/useMessageProcessing.ts`
     - `source/hooks/conversation/core/autoCompressHandler.ts`
     - `source/utils/core/compressionCoordinator.ts`
     - `source/utils/execution/subAgentExecutor.ts`
     - `source/utils/execution/subAgentStreamProcessor.ts`
     - `source/utils/execution/teamExecutor.ts`
  2. 输入/终端焦点基础设施：
     - `source/hooks/input/useKeyboardInput.ts`
     - `source/hooks/ui/useTerminalFocus.ts`
  3. UI/工具显示：
     - `source/ui/components/tools/FileRollbackConfirmation.tsx`
     - `source/ui/pages/chatScreen/ChatScreenPanels.tsx`
  4. `main` 额外补丁：
     - `source/mcp/utils/filesystem/similarity.utils.ts`
     - `source/ui/components/tools/DiffViewer.tsx`
- 当前魔改线与上游的高冲突热点主要集中在：
  - `source/hooks/conversation/chatLogic/useMessageProcessing.ts`
  - `source/hooks/conversation/core/autoCompressHandler.ts`
  - `source/utils/execution/subAgentExecutor.ts`
  - `source/utils/execution/subAgentStreamProcessor.ts`
  - `source/utils/execution/teamExecutor.ts`

### 同步策略
采用 **方案 A：分桶同步 + 每桶五层边界复核**。

#### 桶 1：低冲突基础设施 / UI / `main` 补丁
- `source/hooks/input/useKeyboardInput.ts`
- `source/hooks/ui/useTerminalFocus.ts`
- `source/ui/components/tools/FileRollbackConfirmation.tsx`
- `source/ui/pages/chatScreen/ChatScreenPanels.tsx`
- `source/mcp/utils/filesystem/similarity.utils.ts`
- `source/ui/components/tools/DiffViewer.tsx`
- 视依赖情况再评估 `package.json` / `package-lock.json`

#### 桶 2：高冲突核心 / 执行稳定性
- `source/hooks/conversation/chatLogic/useMessageProcessing.ts`
- `source/hooks/conversation/core/autoCompressHandler.ts`
- `source/utils/core/compressionCoordinator.ts`
- `source/utils/execution/subAgentExecutor.ts`
- `source/utils/execution/subAgentStreamProcessor.ts`
- `source/utils/execution/teamExecutor.ts`

### 边界护栏
- 只允许吸收上游通用稳定性、输入基础设施和 UI 修复，不允许顺手回退现有 `vcpCompatibility/*` seam。
- 不允许把 `VCP` 语义重新塞回 `Snow Core`。
- 不允许让执行层重新承担路由层职责。
- 与 `toolPlane`、`binding`、`projection`、`bridge sidecar` 相关的本地 seam 改动必须优先保留；若与上游修复冲突，采用“手工吸收上游思路而非整段覆盖”。

### 验证顺序
1. 每桶完成后先跑 `npm run build:ts -- --pretty false`
2. 桶 1 完成后跑输入/UI 相关 smoke 与 `local` 抽样黑盒
3. 桶 2 完成后跑 `subagent/team + bridge/hybrid` 黑盒
4. 同步完成后开启 reviewer 子代理做五层边界 `~review`
5. 最后补全 `local / bridge / hybrid + subagent / team` 黑盒矩阵，并对照 `VCPToolBox` DebugLog


## 8. 2026-04-05 ???????

### ?????
- `42.3` ?????????? bridge approval ? canonical identity ??????????`exactToolName / commandIdentifier / commandName`??`snow-cli` ???????????????????? Snow Core?
- `42.8` ??? sideband ??????? `snow-cli` ???????? `thinking / toolResult / toolResultPreview / toolStatusDetail` ?????????? legacy ??????????????????

### ????
- `VCPToolBox` ????? `Plugin.js`?`modules/toolApprovalManager.js` ? `Plugin/SnowBridge/*` ?? bridge/plugin seam????? `server.js` ? `modules/chatCompletionHandler.js`?
- `snow-cli` ????? `display / UI sidecar / vcpCompatibility metadata consumer`????????? provider flow?tool routing core ? session persistence schema?
- ?????????????????? blackbox / ~review?
