# 任务清单: vcp-five-layer-boundary-correction

```yaml
@feature: vcp-five-layer-boundary-correction
@created: 2026-03-28
@status: in_progress
@mode: R3
```

## 进度概览

| 完成 | 失败 | 跳过 | 总数 |
|------|------|------|------|
| 174 | 0 | 4 | 184 |

## LIVE_STATUS

```yaml
current_focus:
  - 保持五层边界修正后的代码与方案包事实一致
  - 为后续黑盒与收尾审计保留本次全面修复结论
  - 继续避免把 translator / router 职责回灌进 Snow Core 与 VCPToolBox 主链
  - 将“VCP 工具协议 -> Snow function-calling”进一步明确为 translator 主责，并补齐 1.0 版本尚缺的协议支持项
  - 将 2026-03-30 深度 `~review` 的真实阻塞、已证伪结论与异机续修顺序详细回写，避免另一台机器继续沿旧结论漂移
  - 将当前分支真实兼容面收敛为“语法保真 / Outbound `::Time` / Tool Plane / Display / Session Policy”五组事实，并把 1.0 前治理项显式挂入方案包
  - 为后续云端/远端 `VCPToolBox` 场景预留 `SnowBridge` 远程 WS 地址覆盖能力，但不破坏当前 `baseUrl + bridgeVcpKey` 本地推导链与 Snow-only 来源契约
  - 固定 `37.x` 借鉴项的最新排期结论，并在提交前清洗本次 reviewer 已证实的 warning 修复与黑盒 spot-check 结果
  - 将 `VCPToolBox / VCPChat / VCP` 设计哲学里还能安全纳入当前五层过渡基线的非深度借鉴项固定为 `40.x` backlog，并明确排除深度魔改候选
latest_true_state:
  - 2026-04-06 ??????? `snow-fork` ??????? `~review`???????????????????????????????? `subagent local`??? `source/utils/execution/teamExecutor.ts` ? local ????? `prepareToolPlane()`?`projectToolMessagesForContext()`?`resolveVcpModeRequest()` ? `applyVcpOutboundMessageTransforms()` ?? VCP ?????????????????? `subagent` ????? `backendMode=vcp + toolTransport=local` ? team ??????? bridge/hybrid?
  - 2026-04-06 ?? review ?????????????????`source/utils/session/vcpCompatibility/toolExecutionBinding.ts` ????? key ????? fallback binding plane???????? `snow-fork` ?????? session / plane ?????????????? bridge/hybrid ?? key????`toolMessageProjection.ts` ? `buildConversationToolMessage()` ???? live conversation ???????? tool result???????????????????????????????? `team local` ???
  - 2026-04-06 ??????????? `snow-fork` ?????sub-agent ? `?? H:\github\VCP\.helloagents` ??????????????? `filesystem-read`??????????????? session ? `tool context omitted: projection budget exceeded`???? `39.2 / 40.10` ??? tool projection helper ??? sub-agent ???????????????? `snow-fork` ???????????????`source/utils/execution/subAgentStreamProcessor.ts` ??? sub-agent ??? token fallback ????? `projectToolMessagesForContext()` ??????????????????????? `MAX_TOTAL_PROJECTED_TOOL_CHARS=6000` ???????????????????????? `npx ava source/utils/execution/subAgentStreamProcessor.test.ts source/utils/execution/subAgentExecutor.test.ts source/utils/session/toolMessageProjection.test.ts` = `8 passed`?`npm run build:ts -- --pretty false` ?????????? `~review + fresh subagent blackbox` ?????? caller/UI ????
  - 2026-04-06 ???? `snow-fork` ?? sub-agent ????????????`source/utils/execution/subAgentStreamProcessor.ts` ??? `resolveVcpModeRequest()` ? VCP chat ?????????????? `outboundProjectionBridge` ? older assistant/tool message ????????? outbound transform ????????????????????????????????/??????`source/utils/execution/subAgentExecutor.ts` ????? `compressionCoordinator.waitUntilFree(ctx.instanceId)` ??????????????/??????????????????`npx ava source/utils/execution/subAgentStreamProcessor.test.ts source/utils/execution/subAgentExecutor.test.ts source/utils/session/vcpCompatibility/outboundProjectionBridge.test.ts source/utils/session/toolMessageProjection.test.ts` = `15 passed`?`npm run build:ts -- --pretty false` ???`npm run test:vcp:blackbox -- --suite subagent --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode local` ???fresh session=`6a043800-0a17-40f4-9a19-ed23781ab388`????????? `snow --vcp` live ?? `?? H:\github\VCP\.helloagents`??? caller/UI ??????? `filesystem-read`?
  - 2026-04-06 已先收口一条新的 prompt seam 一致性修复：`source/utils/session/vcpCompatibility/systemPromptPolicy.ts` 现在在 `backendMode=vcp + toolTransport=local` 下改为 `ROLE` 感知的薄 builtin prompt，不再绕开 `promptHelpers.ts`；同时 `chat / anthropic / gemini / responses` 四条 provider 路径现统一复用该 policy，消除 `chat` 独有最小提示词而其余 provider 仍回落完整 `getSystemPromptForMode()` 的 split-brain。当前改动仍限制在 `prompt policy seam`，没有新增对 `VCPToolBox/server.js` 或 `VCPToolBox/modules/chatCompletionHandler.js` 的侵入。
  - 同次已补做 fresh core 黑盒与夹具收口：`node scripts/vcp-blackbox.mjs --suite core --mode local --mode bridge --mode hybrid --config scripts/fixtures/vcp-blackbox.local-bridge.json --keep-temp` 已通过，session=`efc8462c-d9fc-4467-81f8-ac69835f910f`（local）、`a233016d-ff98-4f45-8ef7-ddc35c13d654`（bridge）、`c13b80f8-0906-46cf-9480-8440556468d4`（hybrid）。本轮同时确认此前失败主要来自 blackbox 对纯文本 reply 的过严断言，因此 `scripts/vcp-blackbox.mjs` 已放宽为接受代码围栏/反引号包裹的等价纯文本，不再把展示层轻微格式差异误判成 runtime 回归。
  - 2026-04-05 已新增一条必须防漂移记录：用户在真实主窗口坐实的“sub-agent 自动压缩后把 internal handover / start a new session 一类话术直接漏给用户”并不是当前 VCP 魔改独有回归。对照 `snow-fork` 已确认，上游 `source/utils/core/subAgentContextCompressor.ts` 原本就使用 handover 导向压缩提示词，`source/utils/execution/subAgentExecutor.ts` 也缺少“压缩泄漏回复不可直接作为最终答案”的恢复护栏；因此这条应定性为上游 Snow 子代理压缩设计缺陷，而不是 `VCPToolBox` 或五层架构边界漂移。
  - 同次已在当前 `snow-cli` 做薄修，且范围仍限制在 `sub-agent execution seam`：`source/utils/core/subAgentContextCompressor.ts` 已把压缩提示词改为 internal continuation summary，并明确禁止提及 compression / handover / start a new session；`source/utils/execution/subAgentExecutor.ts` 已新增 compression leak 检测与恢复重试逻辑，命中泄漏回复时不再直接把它当最终 assistant，而是剥离尾部 assistant message 后重新注入 continuation 指令继续执行。当前没有新增对 `VCPToolBox/server.js` 或 `VCPToolBox/modules/chatCompletionHandler.js` 的改动。
  - 2026-04-05 针对上条薄修的定向验证已通过：`npx ava source/utils/execution/subAgentExecutor.test.ts` = `6 passed`，新增覆盖“handover / 新会话 / context limit”泄漏识别；`npm run build:ts -- --pretty false` 通过。下一步不应再围绕“这是否是 VCP 专属缺陷”反复误判，而应进入一轮真实长上下文 sub-agent live spot-check，验证 UI 不再吐出交接话术。
  - 2026-04-04 已补做一轮“文档不可信、以真实代码为准”的 `VCPToolBox / VCPChat / VCP` 非深度借鉴审计，并决定把结论固定到新的 `40.x`。当前可进入五层过渡基线的新增方向主要有三类：一类是 `VCPToolBox/SnowBridge` 侧的 `Tool Profile` 缩面、bridge approval hint、基于 hot reload watcher 推导的 `manifest revision/reloadedAt` sidecar、bridge capability/version metadata、执行前参数归一化与 accepted/final callback ingress；一类是 `VCPChat` 侧的会话全文检索入口、渐进式历史回放与列表渲染、富文本/旧上下文净化侧车、发送前投影雏形与长文本输入降压为附件 sidecar；还有一类是 `RAGDiaryPlugin` 侧的统一净化链、上下文去重 + dedupBuffer 补偿、多源预算分配、rerank 预算门禁与只读 ContextBridge 注入治理。它们共同特点是都能落在 `session / display / chat seam / outbound seam / router / bridge / execution seam`，不需要打穿 Snow core/provider/chat loop
  - 同次也已明确一组“只做深度分支候选、不纳入当前过渡基线”的排除项：`context budget manager` 内化、tool plane 一等公民化、占位符总线/预处理器中枢、完整 `abort + interrupt + partial finalize`、完整浏览器级富渲染与 smooth streaming 引擎、以及 `All记忆/记忆主权` 这类 VCP 终态能力。后续 reviewer 若再看到这些点，只能把它们挂到深度魔改分支，而不能回灌当前过渡包
  - 2026-04-03 针对收尾 reviewer 抓出的 3 条真实 `Warning` 已做最小修复并通过定向验证：`bridgeManifestTranslator.ts` 不再把泛化英文 `must be ...` 误提取为 `const`；`sessionConverter.ts` 已恢复 successful sub-agent quick tool 的 compact replay；`toolDisplayConfig.ts` 现让普通 `vcp-*` bridge 工具默认进入 two-step display，从而接上 `bridgeClient -> toolExecutor -> toolCallRoundHandler` 的实时状态 sideband。对应验证为 `npx ava source/utils/config/toolDisplayConfig.test.ts source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts source/utils/session/vcpCompatibility/bridgeClient.test.ts source/utils/session/vcpCompatibility/toolPlaneFacade.test.ts source/hooks/conversation/core/toolResultDisplay.test.ts source/utils/session/sessionConverter.test.ts` = `36 passed`，`npm run build:ts -- --pretty false` 通过，`git diff --check` 通过
  - 同次又补做了 fresh `bridge/hybrid` live spot-check：`node scripts/vcp-blackbox.mjs --suite core --mode bridge --mode hybrid --config scripts/fixtures/vcp-blackbox.local-bridge.json` 已通过，session=`95686139-bb71-4b34-aef0-92efbbf03ed9`（bridge）与 `64f9d30c-2ab0-4b73-b331-aad0eaa1a248`（hybrid）；bridge 继续命中 `vcp-servercodesearcher-searchcode(query=SnowBridge)`，hybrid 继续先走 `filesystem-read(D:/github/VCP/snow-cli/source/cli.tsx)` 再走 bridge search，当前未见本轮收尾修复引入新的 runtime 回归
  - 2026-04-03 已固定 `37.x` 借鉴项排期：`37.2` 应优先进入当前五层基线，且只做 `executor/display seam` 的 `image_url -> Snow` 最小多模态规范化；`37.8` 可作为基线尾部 `P3` 项推进，但必须限制在 `session sidecar / UI` 观察层，不得进入 prompt / translator 主链；`37.7` 的完整“本地 abort + 远端 interrupt + partial finalize”与 `37.9` 的持续异步标题归纳均改判为深度魔改分支或独立 UX 分支事项，不再挤入当前过渡基线
  - 同次还补记一条新的借鉴候选：`37.10 router/tool-plane capability snapshot + reasonCode sidecar`，定位为纯 seam 级可观测性增强，主要服务后续黑盒与审计，不触碰 Snow core/provider
  - 2026-04-03 当晚已正式收口 `37.2 / 37.8 / 37.10`，且范围仍保持在当前五层过渡基线：`37.2` 现已在 `toolHistoryArtifacts.ts`、`toolExecutor.ts`、`toolResultDisplay/sessionConverter` 回放链中补齐 `content[{type:'image_url'}]` 的最小兼容，raw payload 继续保留，`historyContent/previewContent` 仅写入净化后的 `[N image URL item omitted]` 摘要；`37.8` 现已把 `mtime / size / messageCount` 收束为 `sessionManager.ts` 的 session-list metadata projection，并只在 `SessionListPanel.tsx` 显示文件体积，不进入 prompt / translator / project data 主链；`37.10` 现已在 `toolRouteArbiter.ts -> toolPlaneFacade.ts -> useConversation/useStreamingState -> StatusLine.tsx` 之间补齐 runtime capability snapshot + `reasonCode` sidecar，但经 reviewer 指出后又立即收口了两条真实风险：一是 `conversationSetup.ts` 对 router 类型的直接依赖已回退为 facade 类型依赖并重新通过 `conversationSetupSeam.test.ts`，二是 `toolPlaneRuntimeState` 已在 `ChatScreen.tsx` 的 `profile/remount` 变化与 `useChatHandlers.ts` 的会话切换/Review 入口中显式清空，不再残留 stale runtime state
  - 上述 `37.2 / 37.8 / 37.10` 的定向验证现已通过：`npx ava source/utils/session/vcpCompatibility/conversationSetupSeam.test.ts source/utils/session/vcpCompatibility/toolPlaneFacade.test.ts source/ui/components/common/statusline/vcpToolPlane.test.ts source/utils/execution/toolExecutor.test.ts source/hooks/conversation/core/toolResultDisplay.test.ts source/utils/session/sessionConverter.test.ts source/utils/session/sessionManager.test.ts` = `40 passed`；扩展 targeted 套件 `... toolRouteArbiter.test.ts ...` = `43 passed`；`npm run build:ts -- --pretty false` 通过，`git diff --check` 通过
  - 同次已对收口后的完整运行态重新执行 fresh 黑盒：`native/local` session=`ac0d07e6-40c8-4aa1-8aa3-5cbe81cff94d`，`vcp/local` session=`62bf557b-1b62-4faf-9d82-e3e1cdcdb272`，`vcp/bridge` session=`bf86d78c-cc57-49a7-bbe8-19e3352a7f1c`，`vcp/hybrid` session=`4874d40e-de23-4e85-8746-b3e5a87cd960`，`subagent` session=`d8d929f7-b0b4-49dc-8199-016d3ccd10ad`，`team` session=`2c28126e-0a58-4878-861a-0579dc04d3a1`。当前样本均通过，未见 `image_url` URL 噪声泄漏、tool-plane runtime state 残留误显、或本轮 `37.10` 可观测性旁路污染主消息链
  - 当前收尾 reviewer 还保留了 1 条非阻断性能债：`toolPlaneFacade.ts` 在 hybrid 下为了前推 `excludeExactToolNames`，仍需等待本地工具名枚举后再拉取带过滤 manifest，导致冷启动时 bridge manifest 获取与本地工具发现存在依赖串行。这条属于 `37.3` 的性能交换，而不是本轮功能回退；当前先作为后续优化项记录，不阻塞本次提交
  - 2026-04-03 已额外收口 `37.x` 后续低优先级债务：`toolCallRoundHandler.ts` 的 askuser 占位 ID 已从 `fake-tool-call` 改为真实轻量交互 ID；`sessionConverter.ts` 中本轮暴露出的 `as any` / 临时挂 `parallelGroupId` 路径也已改为显式 helper 与预索引访问，不再继续误导后续审计
  - 同次还对 `sessionConverter.ts` 做了最小性能收口：regular/subAgent tool replay 元信息已预先索引为 `indexedRegularToolCalls / indexedSubAgentToolCalls`，工具结果恢复不再通过多段回看历史消息查找 tool meta 与 parallel group；对应回归已新增“parallel group replay 保真”断言，`npx ava source/utils/session/sessionConverter.test.ts source/hooks/conversation/core/toolResultDisplay.test.ts` = `9 passed`
  - 本次针对“最小化落地是否掩盖更深技术债”的复核结论也应固定：当前没有发现新的 `Critical/Warning` 级别隐藏问题，没有额外的 core 漂移或被掩住的阻断性性能坑；仍保留的只是不阻塞当前分支的小型整理项，例如 `MessageList.tsx` / `MessageRenderer.tsx` 各自保留颜色与多行渲染逻辑、`extractThinkingFromMessage()` 仍是本地 helper 而非共享模块，这些都属于后续展示层整洁度优化，不影响本轮关单
  - 2026-04-03 已正式收口 `37.1`：`snow-cli/source/utils/session/vcpCompatibility/bridgeClient.ts` 现把 `vcp_tool_status` 归一化为结构化 `BridgeStatusEvent`，`executeTool()` 会同时通过 `onStatus` 透出运行中状态并在最终响应附加 `statusEvents`；`toolExecutor.ts -> toolCallRoundHandler.ts` 也已把该状态接到 pending tool UI 的原位更新，但仍停留在 `executor/display seam`
  - 2026-04-03 已正式收口 `37.3`：`toolPlaneFacade.ts` 现会在 hybrid 模式下把本地工具名去重后作为 `excludeExactToolNames` 前推给 `SnowBridge` manifest；`VCPToolBox/Plugin/SnowBridge/index.js` 也已扩展 `toolFilters` 协议并改成命令级过滤，不再只按整插件粗筛。当前边界仍保持为 `router seam + SnowBridge`，未回灌 Snow core
  - 2026-04-03 已正式收口 `37.4`：`bridgeManifestTranslator.ts` 现对稳定的 fixed-value / enum-like 描述保守提取 `const/enum` 约束，并补了 translator 回归测试；约束提取仍停留在 `translator seam`，没有把旧 transport 字段重新喂进 Snow core schema
  - 2026-04-03 已正式收口 `37.5 / 37.6`：工具 UI 消息现改为“正文空 content + sideband 状态文本 + raw toolResult/preview sidecar”双通道显示；`toolCallRoundHandler.ts` 会按 `toolCallId` 原位替换 pending 行并推进异步生命周期，`sessionConverter.ts` 恢复会话时也会跳过已落盘最终结果对应的旧 pending 行，避免 replay 双份堆叠
  - 2026-04-03 已继续把 `37.x` 收口后的两条低优先级审计噪音一并清掉：`toolCallRoundHandler.ts` 的 askuser 占位 ID 现改为显式 `askuser-{timestamp}-{seq}`，不再使用 `fake-tool-call`；`sessionConverter.ts` 与该 handler 中这轮暴露出的低价值 `as any` 恢复路径也已清掉
  - 同次还补了一刀非阻断债务治理：`MessageList.tsx` 与 `MessageRenderer.tsx` 的 tool sideband 判定现已统一收束到 `source/utils/session/vcpCompatibility/toolSideband.ts`；`sessionConverter.ts` 也从“多次反向扫描历史消息找 tool meta”改成了预建 `tool_call_id -> meta` 索引后再恢复 UI，避免 replay 继续维持明显的 `O(n^2)` 热路径
  - 上述 `37.1 / 37.3 / 37.4 / 37.5 / 37.6` 的定向验证已通过：`npx ava source/utils/session/vcpCompatibility/bridgeClient.test.ts source/utils/session/vcpCompatibility/toolPlaneFacade.test.ts source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts source/hooks/conversation/core/toolResultDisplay.test.ts source/utils/session/sessionConverter.test.ts` = `31 passed`；`npm run build:ts -- --pretty false` 通过；`node --check D:/github/VCP/VCPToolBox/Plugin/SnowBridge/index.js` 通过
  - 同次还补做了 fresh `bridge/hybrid` live 黑盒：`node scripts/vcp-blackbox.mjs --suite core --mode bridge --mode hybrid --config scripts/fixtures/vcp-blackbox.local-bridge.json` 已通过，session=`bde444a2-bf71-4d65-b50f-9777203108e3`（bridge）与 `86a473cc-048c-4ed8-97a8-4ba33968d3cf`（hybrid）；当前样本未见工具完成语义丢失、pending 消息重复堆叠或 display sideband 泄漏进最终 assistant 正文
  - 本次扩大版 `~review` 的真实结论应固定为：本轮实现仍停留在 `vcpCompatibility / execution / display / session replay / SnowBridge plugin` 这些 seam，没有新增回灌 Snow provider/chat core 的漂移；此前观察到的两条低优先级债务（`fake-tool-call` 占位 ID 与 `sessionConverter.ts` 的低价值 `as any` 恢复路径）也已在同日补丁中清掉。当前剩余更值得后续单列治理的只是一条非阻断维护债：`MessageList/MessageRenderer` 与 replay 恢复链虽然已做去重和索引化，但长会话 UI 恢复仍有进一步下沉 shared presenter/helper 的空间
  - 2026-04-03 已在 `verify/20260330-official-main-merge` 分支正式接上新一轮 `36.x`：官方 `v0.7.5` 合并结果已先独立提交并推远端，commit=`f8ac619`，message=`merge: integrate official v0.7.5 while preserving vcp seams / 合并官方 v0.7.5 并保留 VCP seam 改造`；因此当前 `36.x` 后续不再与上游合并混改
  - 同次还确认此前 `stash@{0}` 并不是一组可直接重放的 `36.x` tracked diff，而只剩一个未跟踪草稿 `source/utils/execution/toolHistoryArtifacts.ts`；本轮改为人工吸收该 helper 思路并直接对齐 `v0.7.5` 后工作树，避免把旧 stash 状态再覆盖回当前分支
  - 2026-04-03 已正式收口 `36.1 / 36.2 / 36.3` 的本地实现，且范围仍受控停留在 execution / display seam：新增 `source/utils/execution/toolHistoryArtifacts.ts`，把 tool history 摘要构造从 `toolExecutor.ts` 拆出；高膨胀结果现会产出结构化 `historySummary`，字段覆盖 `summary / status / asyncState / itemCount / topItems / truncated`；同时已把 `historyContent` 与 `previewContent` 拆开，前者继续供 conversation context 使用，后者才供 `ToolResultPreview.tsx` 默认展示紧凑摘要
  - 2026-04-03 已完成 `36.4` 的只读审计取证并固定结论：`SnowBridge` 当前还没有桥侧预摘要/compact result 机制，最合适的落点只能是 `VCPToolBox/Plugin/SnowBridge/index.js` 的发送前桥接层，即 `handleExecuteTool()` 的同步结果发包前、`plugin_async_callback` 的异步完成结果发包前，以及可选的 `forwardLog()` 轻量进度 sidecar；`PluginManager` 主链与插件执行结果本体不应被本轮改动打穿
  - 同次还固定了 `36.4` 的最小契约：`snow-cli` 侧继续只依赖 `{status, result?, error?, asyncStatus?}` 这一层包络完成语义；如果桥侧前移 compact，只允许以 additive sidecar 形式附加 `historyContent` / `previewContent` 或等价字段，不能把 `pluginName / commandName / manifest 片段 / 旧 TOOL_REQUEST 协议壳` 回灌进 `snow-cli` core
  - 当前 `36.4` 第一批桥侧 compact 候选已锁定为高膨胀插件 `FileOperator`、`UrlFetch`、`LightMemo`、`VSearch`；第二批候选为 `CodeSearcher`、`VCPEverything`、`FileTreeGenerator`。其中可借鉴的现成模式已记录为 `ToolBoxFoldMemo` 的 `vcp_dynamic_fold`、`RAGDiaryPlugin` 的 `_cleanResultsForBroadcast() + slice(0,10)`、`VSearch` 的 raw->summary 两阶段与 `FileOperator` 的批处理摘要思路
  - 本轮 `36.x` 的验证链已通过：`npx ava source/utils/execution/toolExecutor.test.ts source/hooks/conversation/core/toolResultHistory.test.ts source/hooks/conversation/core/toolResultDisplay.test.ts source/utils/session/sessionConverter.test.ts source/utils/session/toolResultView.test.ts` = `26 passed`；`npm run build:ts -- --pretty false` 通过；当前证据支持把 `36.1 / 36.2 / 36.3` 改判为已完成
  - 2026-04-03 已完成 `36.4` 的桥侧只读审计并固定边界：`SnowBridge` 当前没有现成 compact/pre-summary 能力，且最适合落点仅限 `VCPToolBox/Plugin/SnowBridge/index.js` 的发送前桥接层，即 `handleExecuteTool()` 同步结果出站前与 `plugin_async_callback` 异步结果回推前；`Plugin.js` 主链保持透传，不应承接这类 Snow 专属折叠语义
  - 同次 `36.4` 取证已固定最小契约：桥侧若前移 compact，只允许为 `vcp_tool_result` 附加通用 sidecar，例如 `historyContent` 与 `previewContent`，主包络仍保留 `{status, result?, error?, asyncStatus?}`；不得把 `pluginName/manifest/旧 TOOL_REQUEST 语义` 或 Snow UI 细节反灌进主结果契约
  - `36.4` 还已明确第一批适合桥侧 compact 的高膨胀插件是 `FileOperator`、`UrlFetch`、`LightMemo`、`VSearch`；它们共同特征是 raw result 内含长列表、正文全文、RAG 命中块或批处理结果，但真正给模型历史所需的只是“做了什么、命中了多少、首批关键项、是否截断”这一层摘要。后续实现应优先在 `SnowBridge` 侧生成最小 sidecar，而不是继续把折叠职责压回 `snow-cli` core
  - 2026-04-03 随后已把 `36.4` 的最小实现正式落到 `VCPToolBox/Plugin/SnowBridge/index.js`：`buildToolResultPayload()` 现仅对 `FileOperator / UrlFetch / LightMemo / VSearch` 追加 additive compact sidecar；sidecar 使用 `historyContent + previewContent` 承载 `summary / itemCount / topItems / truncated`，原始 `result` 与 `Plugin.js` 主链保持透传
  - 同次还确认 `snow-cli` 侧无需继续新增 core 改动：`source/utils/execution/toolHistoryArtifacts.ts` 早已支持优先消费 bridge 显式 sidecar。本轮最小验证已通过 `node --check D:\\github\\VCP\\VCPToolBox\\Plugin\\SnowBridge\\index.js` 与 `npx ava source/utils/execution/toolExecutor.test.ts source/hooks/conversation/core/toolResultHistory.test.ts`（`18 passed`）
  - 2026-04-03 已完成 `36.4` 第一版稳定实现，且改动仍受控停留在桥接层与 execution seam：`VCPToolBox/Plugin/SnowBridge/index.js` 现仅在 `buildToolResultPayload()` 的成功结果路径附加 compact sidecar，同步 `handleExecuteTool()` 成功结果和异步 `plugin_async_callback` 完成结果都会为 `FileOperator`、`UrlFetch`、`LightMemo`、`VSearch` 生成 `historyContent/previewContent`
  - 同次 `snow-cli` 只补了最小消费闭环而未回灌 core：`source/utils/execution/toolExecutor.ts` 现会优先消费 bridge 返回的 `historyContent/previewContent`，避免把整个 bridge 包络再次摘要一遍；`source/utils/execution/toolHistoryArtifacts.ts` 也继续把 `historyContent/previewContent/historySummary` 视为旁路字段，并在“大集合 + 顶层 summary”场景下避免把 preview 摘要回流进模型 history
  - `36.4` 当前验证已通过：`node --check VCPToolBox/Plugin/SnowBridge/index.js` 通过；`npx ava source/utils/execution/toolExecutor.test.ts` = `13 passed`（已新增 bridge sidecar 消费回归）；`npm run build:ts -- --pretty false` 通过。因而本项可改判为“桥侧预摘要能力第一版已稳定落地”，剩余只待 `36.5` live 黑盒与 `VCPChat` 差异留痕
  - 2026-04-03 已完成 `36.5` 第一轮 fresh live 黑盒：执行 `node scripts/vcp-blackbox.mjs --suite core --mode bridge --mode hybrid --config scripts/fixtures/vcp-blackbox.local-bridge.json` 后，`bridge` session=`100352f5-1d07-4e6d-9386-604ed2fee71b` 与 `hybrid` session=`62e5ec8b-419c-4a7a-9b93-55554fe31edd` 均通过；`bridge` 命中 `vcp-servercodesearcher-searchcode(query=SnowBridge)` 且最终 assistant 仅复述首条命中文件 `.helloagents\\modules\\plugin-system.md`，`hybrid` 则先走 `filesystem-read` 再走 bridge search，两条链路都未出现 tool result `error`、完成语义丢失或隐藏协议泄漏
  - 同次还补做了 `bridge --keep-temp` 复跑用于 session 取证；失败样本 session=`86708880-fd25-4303-9124-3235b42a8576` 已证伪为模型行为漂移而非 runtime 回归：该轮 session 仅记录 `user -> assistant` 两条消息，assistant 直接根据 TagMemo 召回内容回答 `Bridge` 相关记忆，根本没有执行 `vcp-servercodesearcher-searchcode`。daemon log 也只停留在 `Create new session`，因此这应归类为“模型绕过必须调用工具指令”的黑盒假失败，而不是 `36.4/36.5` 的实现缺陷
  - 2026-04-03 重启 `VCPToolBox/SnowBridge` 后又补跑了一轮 `36.5` fresh live 黑盒：`bridge` session=`6a0f9dad-d659-4085-b7b1-13c6f1b5dfe5` 与 `hybrid` session=`6c0e6675-ce69-4998-a5ad-bb3943446333` 再次通过。`bridge` 继续命中 `vcp-servercodesearcher-searchcode(query=SnowBridge)` 并仅返回首条路径 ``.helloagents\\modules\\plugin-system.md``；`hybrid` 继续先命中 `filesystem-read(D:/github/VCP/snow-cli/source/cli.tsx)` 得到 `#!/usr/bin/env node`，再命中同一 bridge 搜索结果。这轮证明重启后的真实运行环境也已稳定，不是上轮黑盒的偶然样本
  - 同次还保留了一份 `hybrid --keep-temp` 成功样本，session=`0ae68684-b0cb-46ad-9312-d5ed02aae037`，落盘文件位于 `C:\\Users\\12971\\AppData\\Local\\Temp\\snow-runtime-blackbox-I56Bns\\.snow\\sessions\\snow-cli-0da71b\\20260403\\0ae68684-b0cb-46ad-9312-d5ed02aae037.json`。其中 bridge tool message 已明确同时保留 raw `content` 与旁路 `historyContent/previewContent`，最终 assistant 仍只输出 ``.helloagents\\modules\\plugin-system.md``；因此当前可以确认摘要旁路未破坏 session 持久化，也未污染最终展示
  - 2026-04-03 当晚又在重启后补了更窄的 fresh 复跑：`bridge` 再次通过，session=`e58081bb-b6ab-4597-bcfa-a6e9a6a56a7a`；`bridge --keep-temp` 也通过，session=`8eb3b013-a2cd-4cae-a3bc-2b24b3cf2832`，该落盘样本已再次确认 bridge tool message 继续保留完整 `{status, asyncStatus, result}` 包络，同时 session 中仍写入 `historyContent/previewContent` 旁路字段
  - 但同轮 `hybrid` fresh 与 `hybrid --keep-temp` 又都命中了旧式模型重试样本，keep-temp session=`1ef4c72f-ddec-4e42-8f06-67b16470efb4`。该 session 明确显示模型先错误调用 `filesystem-read(D:\\github\\VCP\\snow\\source\\index.tsx)` 失败，再第二次调用正确路径 `D:/github/VCP/snow-cli/source/cli.tsx` 成功并最终回复 `#!/usr/bin/env node`；因此当前 `hybrid` 的唯一残余不稳定仍是 blackbox 对“恰好 1 次 local read”的严格断言，而不是 `36.4/36.5` 对完成语义或展示的 runtime 回归
  - 本轮 `hybrid` 黑盒的唯一失败样本已证伪为 runtime 真实回归：keep-temp session=`3421b23c-3109-4430-8179-0df6542d7d12` 明确记录模型首个 `filesystem-read` 先错误请求 `D:/github/VCP/say-cli/source/cli.tsx`，失败后又重试正确路径 `D:/github/VCP/snow-cli/source/cli.tsx`；因此当前失败本质是 harness 对“必须恰好 1 次 read”过严加上模型 typo/重试漂移，不是 `36.x` 摘要改动破坏了 `hybrid`
  - 因而截至当前，`36.4 / 36.5` 均已可以按“第一版桥侧预摘要落地 + bridge/hybrid fresh live 黑盒复核通过”收口；但也要保留覆盖边界说明：现有 live 探针主要验证 `ServerCodeSearcher` 主链未被 compact 改坏，并不等于 `FileOperator / UrlFetch / LightMemo / VSearch` 这批目标插件都已补齐 targeted live 样本。与 `VCPChat` 折叠策略的进一步差异审计继续保留在 `37.x` 借鉴项中推进，不再阻塞本项关单
  - 2026-04-03 已完成 `32.5` 中文文档口径同步：`docs/usage/zh/22.VCP五层边界与Seam说明.md`、`23.VCPTUI测试标准分支说明.md`、`24.SnowBridge与工具传输模式.md`、`25.VCP兼容验证与已知限制.md`，以及入口文档 `docs/usage/zh/0.目录.md` 与 `README_zh.md` 已全部对齐当前方案包事实。当前文档已统一明确三件事：一是五层架构属于“过渡性正确架构”而非终局架构；二是 `36.4 / 36.5` 的 bridge sidecar 与 fresh live 黑盒结论已经属实；三是高膨胀目标插件 targeted live 样本、UI 语义收敛与 VCP 功能借鉴项仍属于后续待办
  - 2026-04-03 已正式收口 `24.4` blackbox harness 最后一条 `Warning`：`scripts/vcp-blackbox.mjs` 的 `subagent` 校验现会同时要求“仅 1 个顶层 `subagent-agent_explore`”“无额外顶层工具”“至少 1 个 `subAgentInternal` 的 `filesystem-read` 命中 probe 文件”“内部 read 结果首行命中预期”“顶层 subagent tool result 首行命中预期”；probe 路径比对也已支持相对/绝对路径统一归一化，不再因 `main.py` vs `D:/.../main.py` 误报
  - 同次还把 `team` blackbox 余留漏报一并收口：`team` 顶层调用现要求与 `team-spawn_teammate -> team-wait_for_teammates -> team-shutdown_teammate -> team-merge_all_teammate_work -> team-cleanup_team -> filesystem-read` 六步完全一致，额外顶层 helper/tool 调用会直接失败；对应回归已补到 `scripts/__tests__/vcp-blackbox.test.mjs`
  - 本轮脚本层定向验证已通过：`node --test scripts/__tests__/vcp-blackbox.test.mjs` = `25 passed`；fresh live `subagent` 黑盒再次通过，session=`38a8ce45-c9f6-446d-9cd5-b93108314a59`；fresh live `team` 黑盒再次通过，session=`77f58f54-3142-4dfc-a41e-b0ba2295f4e3`
  - 2026-04-03 二次 reviewer 复核结论已固定：本次收口没有新的 `Critical/Warning`，修改仍完全停留在 blackbox harness seam（`scripts/vcp-blackbox.mjs` / `scripts/__tests__/vcp-blackbox.test.mjs`），没有越过五层边界回灌 `source/` 运行时代码
  - 2026-04-03 已正式收口 `24.4` 的剩余 fresh 黑盒：`subagent` live 黑盒再次通过，session=`c775cd65-11b9-4e63-ada1-f10be20a31d5`；`team` live 黑盒也已通过，session=`d1856ba7-5925-458f-9d7b-f2d506e71951`。这次通过前连续补了 3 个 blackbox harness 真缺口：team 场景顶层 `expectedTool` 缺失、team suite 在非 git workdir 下缺少临时 probe repo、SSE 子进程 `cwd` 绑在 `snow-cli` 而不是 runtime workdir，导致 `teamMode/team-*` 工具面未按目标仓库加载
  - `team` 黑盒的最终失败原因也已证伪为 runtime bug：keep-temp session 明确记录主链已完整执行 `team-spawn_teammate -> team-wait_for_teammates -> team-shutdown_teammate -> team-merge_all_teammate_work -> team-cleanup_team -> filesystem-read -> final assistant`，真正的问题只是黑盒断言把 teammate 内部 `subAgentInternal` 的 `filesystem-read` 误算进主链 sequence；当前 `scripts/vcp-blackbox.mjs` 已改为过滤内部工具调用，并新增脚本回归测试锁住该口径
  - 2026-04-03 已受控验证 `32.4` 的 `bridgeWsUrl` 默认验证链：配置页 `bridgeWsUrl` 已从 `SELECT_FIELDS` 移出，仅保留 direct text input；`scripts/vcp-blackbox.mjs` 的默认 mode 解析现会在仅提供 `bridgeWsUrl` 时自动启用 `local/bridge/hybrid`。以临时 `bridgeWsUrl` only 配置 fresh 复跑 core suite 已通过，结果为 `local` session=`9caac937-92ae-4eed-942c-d2e21b25c096`、`bridge` session=`c2a9030c-a2f5-4e56-898d-1479174d7b9a`、`hybrid` session=`7508047f-ea90-439e-a766-8508487e221d`
  - 2026-04-03 已开始 `36.x` 的显示/回放折叠第一刀，但刻意只落在 display/replay seam：新增 `source/utils/session/toolResultView.ts`，`toolResultDisplay.ts` 与 `sessionConverter.ts` 现会同时保留 raw `toolResult` 与 display-only `toolResultPreview`，`MessageRenderer.tsx` 改为优先消费显式 `toolName` / `toolResultPreview`，`ToolResultPreview.tsx` 也补了非 JSON 纯文本摘要预览；这一步的目标是让 live/replay 默认显示紧凑摘要，同时不改执行层 payload，不把折叠规则回灌进 `toolExecutor.ts`
  - 上述 `36.x` 第一刀的当前验证已通过：`ava source/utils/session/toolResultView.test.ts source/hooks/conversation/core/toolResultDisplay.test.ts source/utils/session/sessionConverter.test.ts source/ui/pages/configScreen/types.test.ts source/ui/pages/configScreen/configDraft.test.ts` = `10 passed`，`npm run build:ts -- --pretty false` 通过，`npm run build` 通过；但这仍不等于 `36.2 / 36.4 / 36.5` 已完成，当前只算 display/replay side 的第一步收口
  - 2026-04-02 深夜已完成一轮“上下文膨胀止血”定向修复，但刻意未继续打穿 Snow core：`filesystem-read` 自动附加的 notebook 区块现在仅从 `historyContent` 摘要链剥离，UI/raw tool result 仍保留原样；同时 active-round 发给模型的 tool result 现在统一优先投影 `historyContent`，不再把 raw 大结果直接喂进主聊天下一轮、sub-agent 下一轮与 teammate 下一轮
  - 同次修复中，`toolMessageProjection` 已从 `hooks/conversation/core` 下沉到 `source/utils/session/toolMessageProjection.ts`，主工具轮、session 初始化、手动压缩输入、sub-agent 发包与 team 发包都改为复用同一投影 helper；这一步是为了解掉 reviewer 指出的“执行层反向 import conversation core”边界漂移
  - 同次还补齐了 `team-*` 顶层工具结果的 `historyContent` sidecar：`toolExecutor.ts` 现在会为 `team-*` 与 `subagent-*` 顶层结果同步生成 compact `historyContent`，teammate 内部 regular tool 路径也保留了 raw+history sidecar，避免 team 模式端到端继续漏回原始 JSON 大对象
  - 本轮 reviewer 复核后的真实结论应固定为：当前这批上下文止血修复没有新增 `Critical`，并且 helper 下沉后边界比上一版更合理；但它仍属于“五层边界下的过渡治理”，不是直接 fork 成 `snow-vcp-native` 的终局重写方案
  - 本轮定向验证已通过：`npx ava source/utils/execution/toolExecutor.test.ts source/hooks/conversation/core/toolResultHistory.test.ts source/utils/execution/subAgentExecutor.test.ts source/utils/execution/teamExecutor.test.ts` = `22 passed`；`npm run build:ts -- --pretty false` 通过
  - 2026-04-02 晚间已先行落一版 `32.6` 的 UI 语义收敛实现：`source/ui/pages/configScreen/useConfigState.ts` 现在仅在 `backendMode=vcp` 时展示 `toolTransport`，bridge 凭据字段也只有在 `vcp + bridge/hybrid` 下才进入配置页字段列表；切回 `native` 时只隐藏字段，不主动抹掉原有 `toolTransport` 选择，便于之后切回 VCP 时恢复
  - 同次 `32.6` 定向验证已通过：`npx ava source/ui/pages/configScreen/types.test.ts source/ui/pages/configScreen/configDraft.test.ts` = `5 passed`，`npm run build:ts -- --pretty false` 通过；同时新增了字段显隐纯函数测试，锁定“`native` 隐藏 `toolTransport` / `vcp + bridge-capable` 才显示 bridge 凭据”的契约
  - 2026-04-03 已正式关单 `32.6`：配置页 UI 语义现已按事实收敛为“`backendMode=native` 不显示 `toolTransport`，仅在 `backendMode=vcp` 时展示工具传输方式，且 bridge 凭据字段只在 `vcp + bridge/hybrid` 下出现”；当前策略继续保留原有 `toolTransport` 选择值而不在切回 native 时强行抹掉，避免用户回切 VCP 后配置漂移
  - 同次 `32.6` 收口验证已补齐：`npx ava source/ui/pages/configScreen/types.test.ts source/ui/pages/configScreen/configDraft.test.ts source/ui/components/common/statusline/vcpToolPlane.test.ts` = `9 passed`，`npm run build:ts -- --pretty false` 通过；其中配置页纯函数测试继续锁定“native 隐藏 `toolTransport` / `vcp + bridge-capable` 才显示 bridge 凭据”
  - 2026-04-03 已正式实现 `32.7` 的运行中工具面标识，且范围刻意只停留在 UI seam：新增 `source/ui/components/common/statusline/vcpToolPlane.ts` 与 `vcpToolPlane.test.ts`，`StatusLine.tsx` 现在直接从当前 profile `snowcfg` 投影运行时 `backendMode/toolTransport`，仅在 `backendMode=vcp` 时显示 `Local tools（Snow 本地/MCP）`、`SnowBridge（VCP 工具桥接）` 或 `Hybrid（本地工具 + SnowBridge）`，没有把这套语义反向灌回 chat core / executor / provider
  - 同次 `32.7` 的定向验证已按真实工作树复跑通过：`npx ava source/ui/pages/configScreen/types.test.ts source/ui/pages/configScreen/configDraft.test.ts source/ui/components/common/statusline/vcpToolPlane.test.ts` = `9 passed`，`npm run build:ts -- --pretty false` 通过；当前证据支持把 `32.6 / 32.7` 一并视为“代码与类型层面已收口”
  - 本次针对 `32.6 / 32.7` 的本地 review 结论已固定：当前变更只新增 UI 侧 `vcpToolPlane` helper，并在 `StatusLine` / `statusline/types.ts` 中读取 profile config 的只读投影；过程中已主动去掉多余轮询，仅保留 `profileName` 变化与 `configEvents` 刷新，没有新增 `Critical/Warning`，也没有越过五层边界打穿 Snow Core
  - 同次 fresh live 黑盒只记录到一条明确通过样本与两条模型漂移型假失败：`bridge --keep-temp` 通过，session=`4f36a852-d47a-4e8d-8bfb-c4edae7df0ce`，继续命中 `vcp-servercodesearcher-searchcode(query=SnowBridge)` 并返回 `.helloagents\\modules\\plugin-system.md`；`hybrid --keep-temp` 两次失败样本分别为 `dd8ae59e-8563-43ff-8967-98507194aa34` 与 `5c77a9c5-e0c7-4dc2-b86d-9185ed15fbf2`，前者先误搜 `SnowRunner` 再重试正确 `SnowBridge`，后者先误读 `D:\\github\\VCP\\snow\\source\\test.ts` 后才回到正确 `D:/github/VCP/snow-cli/source/cli.tsx`，均属模型重试/记忆漂移，不是本次 UI 改动引入的 runtime 回归
  - 2026-04-02 18:17 前后已完成 `scripts/vcp-blackbox.mjs` 与 `scripts/__tests__/vcp-blackbox.test.mjs` 的 bridge probe 收口：不再把 `Plugin/SnowBridge/plugin-manifest.json` 这种跨仓旧样本写死为通过条件，而是继续用 `query=SnowBridge` 做真实 bridge 搜索，再在黑盒脚本里动态校验“bridge tool 返回 success 且 assistant 复述首条命中路径”；对应脚本回归现以 `node --test scripts/__tests__/vcp-blackbox.test.mjs` 通过（11 passed）
  - 同次重新打包已通过：`npm run build` 成功，bundle 已刷新到最新黑盒脚本口径，没有遗漏重新打包这一步
  - 同次 fresh runtime 黑盒结果已重新收口：`local` session=`f4a6b9d3-6756-47bb-bbbe-cf21476c3821`、`bridge` session=`cc62a259-3a29-45c2-908e-b4d3a1f50007`、`hybrid` session=`dff93b59-bd07-4e5f-887c-9ef207e35221` 全部通过；`local` 仍命中 `filesystem-read -> source/cli.tsx` 并返回 `#!/usr/bin/env node`，`bridge/hybrid` 都命中 `vcp-servercodesearcher-searchcode(query=SnowBridge)`，tool result 为 `status=success`，assistant 最终复述的首条路径为 `.helloagents\\modules\\plugin-system.md`
  - 因而 2026-04-02 本轮 bridge/hybrid 失败已可正式改判为“blackbox 断言样本漂移”，不是 Snow runtime、bridge router、translator 或 VCPToolBox 插件执行错误；后续若再出现 bridge 搜索类失败，应优先先读最新 VCPToolBox DebugLog 与 session 落盘，看首条命中是否漂移，再决定是否需要修改 runtime
  - 2026-04-02 随后已完成 `38.1 / 38.2 / 38.3 / 38.4` 第一批定向修复并通过当前工作树定向验证：`npx ava source/utils/session/vcpCompatibility/timeContextBridge.test.ts source/hooks/conversation/core/streamFactory.test.ts source/hooks/conversation/core/streamProcessor.test.ts source/hooks/conversation/core/toolResultHistory.test.ts` = `21 passed`，`npm run build:ts -- --pretty false` 通过，`git diff --check` 通过
  - `38.1 / 38.2` 已收口：主聊天 `streamFactory.ts`、`subAgentExecutor.ts`、`teamExecutor.ts` 现统一在 resolved VCP request 上下文里调用 `applyVcpOutboundMessageTransforms()`；`::Time` bridge 终于进入真实生产发包链，不再停留在 helper/test 态
  - `38.2` 的运行时门禁也已收口：`timeContextBridge.ts` 现在先校验 `backendMode=vcp`，再基于 resolved request method 做 `chat` 门禁，因此 `backendMode=vcp + 原始 responses/gemini/anthropic 配置` 不会再被误跳过，而 `native localhost` 链也不会误触发
  - `38.3` 已收口：主 assistant 的 `streamProcessor.ts` 现在直接消费 `display.ts` 的 `getVcpStreamingSuppressionDecision()`，因此 `TOOL_REQUEST / TOOL_RESULT / DailyNote / ROLE_DIVIDE / VCP元思考链` 不再只靠最终 assistant 替换兜底；同时仍保留 fenced code block 保护，不会误杀代码示例
  - `38.4` 已收口：`buildHistoryToolMessage()` 不再用 `historyContent` 覆盖 raw `content`；session 中的 tool result 现保留 raw content 作为事实，同时把 `historyContent` 留作旁路字段
  - `38.4` 的上下文投影链也已补齐：`sessionInitializer.ts` 与 `useCommandHandler.ts` 在把 session 消息投影回 conversation context / compression 输入时，才显式将 tool message 投影为 `historyContent`；因此 live UI 与 session reload 会继续看到 raw tool result，而模型上下文与压缩链仍能吃摘要版
  - 当前 `38.x` 这一批修复仍停留在五层边界内：`::Time` 修在 outbound seam，suppression 修在 display seam，tool result 事实/摘要分离修在 session/tool history seam；没有把 provider adapter、tool router 或 `Snow Core` 主语义继续打穿
  - 2026-04-02 已完成 `32.1 / 32.2 / 32.3` 的并行事实审计与五层架构 reviewer 复核；本轮结论不再允许继续把这些项按旧文档口径描述为“已完整实现”
  - `32.1` 审计结论已收口：当前真正被实现并特殊处理的语法主要只有 VCP 协议壳本身，即 `VCP元思考链 / TOOL_REQUEST / TOOL_RESULT / DailyNote / ROLE_DIVIDE`；`[@tag] / [@!tag] / ::Group / ::TagMemo / ::AIMemo / ::TimeDecay / ::RoleValve / ::Base64Memo` 等大多只是 pass-through，`[[...]] / <<...>> / 《《...》》 / {{Var*}}/{{Tar*}}/{{Sar*}}` 也不是通用支持，不能再扩写成“Snow 已正式兼容”
  - `32.1` 审计同时确认：`display.ts` 当前同时承担 parser / transcript formatter / streaming suppressor 三种职责；主 assistant 主链尚未接入实时 suppression，只有 normal assistant 最终保存前净化与子代理流式 suppression 已成立，因此“显示兼容”只能按分层部分成立表述，不能再写成全链实时一致
  - `32.2` 审计结论已收口：`timeContextBridge.ts` 的实现确实只是“最小时间锚点 bridge”，不会做时间窗展开、自然语言时间归一化或宽时间词强扩写；但更关键的是，`applyOutboundMessageTransforms()` 目前没有接入真实生产发包链，`::Time` 当前属于“helper + tests 存在、运行时未接线”的状态
  - `32.2` 审计同时确认潜在接线风险：`timeContextBridge.ts` 现在按 `config.requestMethod === 'chat'` 判门，而 VCP mode 的真实运行时聊天链又会被 `resolveVcpModeRequest()` 收束到 `chat`；后续修复必须落在共享 outbound seam，不能把这套逻辑分散灌进 `chat.ts / responses.ts / anthropic.ts / gemini.ts`
  - `32.3` 审计结论已收口：当前已经存在三种不同口径而非完全统一口径
  - `display`：`display.ts` 可解析并折叠 VCP 协议壳，子代理流式链可实时 suppression；主 assistant 主链仍主要依赖最终消息替换与净化
  - `transcript`：`contextCompressor.ts` 通过 `formatVcpContentForTranscript()` 对 VCP 协议壳做摘要化，但 preserved tail 仍未完全统一走同一出口
  - `session`：normal assistant 正文保存前会经 `assistantContentSanitizer.ts` 净化，但 sub-agent 完整正文、thinking/reasoning 字段与 live tool result 仍存在不同口径
  - reviewer 复核确认当前五层大边界仍基本守住：`conversationSetup -> toolPlaneFacade`、binding-aware executor、`SnowBridge` additive plugin 这些主线没有被打回 Snow Core；但仍存在 3 个真实偏移点，必须作为后续修复约束：`contextCompressor.ts` 直接依赖 `display.ts / mode.ts`、`streamFactory.ts` 直接依赖 `resolveVcpModeRequest()`、`assistantContentSanitizer.ts` 直接依赖 compatibility display stripper
  - reviewer 还确认了一个比预期更严重的新事实：`toolExecutor.ts` 生成的 `historyContent` 已不止用于 transcript/persistence，而是经 `toolCallRoundHandler.ts`、`subAgentExecutor.ts`、`teamExecutor.ts` 直接写入 live conversation/session 历史；这意味着 transcript/persistence 的摘要语义已经反向污染 live 会话事实，属于 `32.3` 后续修复的最高优先级之一
  - 因而 2026-04-02 之后的正确修复顺序已固定为：先把 `32.1 / 32.2 / 32.3` 审计结果固化进方案包，再只在五层边界内修复 3 个真问题：`::Time` 接入共享 outbound seam、主 assistant 流式 suppression 接入 display seam、`historyContent` 从 live 会话事实中剥离回 transcript/persistence 旁路
  - 2026-04-02 已对 `snow-cli`、`snow-cli-raw`、`VCPChat`、`VCPToolBox` 四个仓库补做 HelloAGENTS 知识库初始化审计：确认 `codex exec "~init"` / `~validatekb` 才是正确入口，而不是 `helloagents.exe`
  - 同次审计确认命令链稳定性存在差异：`snow-cli-raw`、`VCPToolBox` 可落成完整 `.helloagents`；`snow-cli`、`VCPChat` 通过 `~init` 只能稳定到“目录已创建、核心文件未落盘”的半初始化状态，因此后续不再把 `resume --last` 当成可靠前置条件
  - 由于 `snow-cli` 与 `VCPChat` 的 `~init` 命令链不稳定，已改为按 HelloAGENTS 模板与项目真实结构手工补齐 `.helloagents/INDEX.md`、`context.md`、`CHANGELOG.md`、`archive/_index.md`、`modules/_index.md` 与最小模块文档；本次只动各仓库 `.helloagents`，未改业务代码
  - 同次手工 validate 结果：四仓库 `.helloagents` 现均具备核心文件、模块索引、非空模块文档与有效相对链接；敏感信息扫描无命中；`snow-cli-raw` 原有 KB 还留有 3 处模板式导航占位，本次已顺手清理，避免后续 `~validatekb` 继续报质量警告
  - 当前结论应固定为：四仓库已经具备可继续使用的 HelloAGENTS 知识库基线；若后续要做正式 `~validatekb` 复核，应视为“对手工基线的二次验收”，而不是再次依赖不稳定的 `~init` / `resume` 流程
  - 2026-04-02 随后已使用多名 `gpt-5.4` reviewer 子代理对四仓库 `.helloagents` 做第二轮正式 `~validatekb` 复核：`snow-cli`、`snow-cli-raw`、`VCPToolBox`、跨仓一致性均已通过；`VCPChat` 早先唯一残余的 `ipc-bridge -> memory-rag` 依赖描述尾巴也已在 `modules/ipc-bridge.md` 补齐，并由窄复核 reviewer 再次确认为通过
  - 本次自动修复只落在知识库文档层：`snow-cli` 侧补齐 fork 身份、`vcp-compatibility` seam 边界与 `docs/usage/zh` 扩展；`snow-cli-raw` 侧补齐原版主链模块映射并修正文案过时描述；`VCPChat` 侧补齐前端子系统、IPC bridge 与 `memory-rag` 依赖；`VCPToolBox` 侧补齐 `SnowBridge` 在 plugin/runtime 口径中的正式位置与运行时数据边界
  - 截至当前，四仓库 HelloAGENTS 知识库的阻断项已收口到零；未再发现需要继续自动修复的 `Critical` / `Warning` 级知识库偏移，本轮 `~validatekb` 可视为完成，后续回到 `32.x` 兼容治理、黑盒与文档收口主线
  - 2026-04-01 晚间第一次合并后 live 黑盒的 `6/6` 失败结论现已证伪为环境假失败：当时 `6005` 端点未启动，导致 `local x2 / bridge x2 / hybrid x2` 统一报 `Timed out waiting for SSE event after index 1`；这批 session id `03191568-44b4-4de1-a902-9ae5e55f9f8b`、`783db2bb-d9cb-49a6-9413-58b633f7a806`、`e992d1e7-2c36-49fa-bece-117a19627434`、`df4be094-2a6c-403b-a71e-24f6d4aa799f`、`7cfa7480-fa8e-4e0e-b961-fec75da67a81`、`7a994dbb-152e-47ec-950f-734067a498ec` 仅保留为环境排障记录
  - 在用户确认 `6005` 后台已启动后，已按同一 fixture 重新复跑 `local / bridge / hybrid` 各 2 轮，当前全部通过：`local` session=`b77d8256-1a1c-4934-bf37-9e4058c428f8`、`e48cbef5-8a93-4f05-b647-19ff9ad23514`；`bridge` session=`f68c7c0e-24f7-4571-bb41-162345b3d13a`、`654900a4-8b64-438c-a778-17b2a3b53b8f`；`hybrid` session=`5b6cb3b5-2db0-41d0-b687-19a73453462e`、`019ede67-9bba-4f4e-b1b1-c36c539e6d47`
  - 复跑通过的链路事实如下：`local` 两轮都命中 `filesystem-read` 并正确返回 `#!/usr/bin/env node`；`bridge` 两轮都命中 `vcp-servercodesearcher-searchcode` 并返回 `Plugin\\SnowBridge\\plugin-manifest.json`；`hybrid` 两轮都先命中本地 `filesystem-read`，后命中 bridge 搜索工具，符合 `local > bridge` 的预期
  - 因而截至当前版本 `b5c47aa`，`34.4` 的正确结论应恢复为：`local / bridge / hybrid` live 黑盒可通过；此前 `SSE event after index 1` 只能作为“依赖服务未启动时的环境错误特征”，不能再当成 `snow-cli` runtime 稳定缺陷
  - 2026-04-01 同轮横向审计也已完成：`VCPChat` 与 `VCPToolBox` 当前最值得借鉴到五层架构的增强点并不是旧 `TOOL_REQUEST` 协议，而是 seam 级能力，包括：`translator` 的入参 canonicalize / 历史净化 / 结构化 tool-result 显示、`executor` 的 phase-tagged 黑盒诊断、`router` 的能力快照与 reason code，以及 `SnowBridge/VCPToolBox` 侧的协议入口强校验、结构化 manifest 参数优先、只读 ContextBridge 注入治理
  - 这些候选增强当前应视为后续 backlog，而不是在修复本轮 SSE 阻断前就继续扩散实现；当前优先级仍然是先锁定 `snow-cli` 在 session 创建后到首个 SSE 事件之间的运行时断点
  - 2026-04-01 已在 `snow-cli` 验证分支 `verify/20260330-official-main-merge` 完成原作者 `v0.7.4` 合并，merge commit=`b5c47aa`；本次不是直接快进到 tag，而是在当前五层边界修正线之上合入 `28b78a8 (v0.7.4)`，用于后续黑盒与主线回收前的最终兼容审计
  - 同次合并的真实冲突共 5 处，均已按“保留 upstream 功能增量 + 保留本分支五层 seam 契约”收口：
    1. `source/ui/pages/configScreen/ConfigFieldRenderer.tsx`：保留 upstream 对 Responses 推理强度/verbosity 的可编辑 UI，但适配回本分支真实在用的 `ScrollableSelectInput`、`supportsXHigh` 与 state setters，未把不存在的 `Select` 组件或未暴露 setter 硬吃进来
    2. `source/utils/config/apiConfig.ts`：仅为 `getMCPServerSource()` 的注释/签名重叠，保留既有 `MCPConfigScope` 契约，不改变 project/global 来源判定语义
    3. `source/utils/execution/mcpToolsManager.ts`：保留本分支按 `Promise.all` 探测外部 MCP、统一回填 `servicesInfo` 的实现，同时吸收 upstream 对 `isMCPToolEnabled()` 的外部工具过滤，不回退到旁路注册
    4. `source/utils/execution/subAgentExecutor.ts`：保留 upstream 将 built-in subagent 定义拆到 `execution/subagents/*` 的结构重组，同时继续保留本分支 `prepareToolPlane()` / execution binding 链，不退回旧的旁路工具收集
    5. `source/utils/execution/teamExecutor.ts`：保留 upstream `rewriteToolArgsForWorktree()` 的工作树约束，同时继续走本分支 binding-aware `executeToolCall()`，因此 team 路径没有退回旧的 `executeMCPTool()` 直连
  - 同次验证已通过：`npm run build:ts -- --pretty false` 通过；`npx ava source/utils/session/vcpCompatibility/conversationSetupSeam.test.ts source/utils/session/vcpCompatibility/toolRouteArbiter.test.ts source/utils/session/vcpCompatibility/mode.test.ts source/utils/session/vcpCompatibility/bridgeClient.test.ts source/utils/execution/teamExecutor.test.ts source/utils/execution/subAgentExecutor.test.ts source/utils/execution/toolExecutor.test.ts source/ui/pages/configScreen/configDraft.test.ts` = `38 passed`
  - 因而截至这次 `v0.7.4` 合并，尚未看到 upstream 新版把 `toolPlaneFacade -> toolExecutionBinding -> team/subagent executor -> configDraft` 这一条五层 seam 打回 Snow core；当前真正未完成的仍是 live 黑盒与后续文档收口，而不是 merge 冲突本身
  - 2026-04-01 已对 `SnowBridge 模式下工具成功却反复调用` 做窄取证并定责：`VCPToolBox/Plugin/SnowBridge/index.js` 实际已回传 `status=success` 的 `vcp_tool_result`，真正丢失的是 `snow-cli/source/utils/session/vcpCompatibility/bridgeClient.ts` 过去只把 `response.result` 往上返回，导致模型只能看到 `{"MaidName":"Nova","timestamp":"..."}` 这类裸业务结果，看不到完成语义；该问题现已在兼容 seam 内修正为保留完整 Bridge 包络，不再把锅误记到插件层
  - 同次日志取证也确认：`local tools + 日记本召回` 的“慢得离谱”主因目前更像 `VCPToolBox` 上游提示词/RAG 注入过重，而不是 Snow 本地工具执行变慢；`2026-04-01 12:02/12:05` 相关 DebugLog 中可见巨量 `Nova日记本`、`SnowCLI手册` 与 `VCP元思考链` 注入，当前将其记录为后续性能治理约束，而不再误判成 Snow route/execution 层阻断
  - 2026-04-01 已对“旧 VCP 几乎不允许模型犯错，而 function-calling/translator 丢护栏”形成新结论：旧护栏主来源是 `TOOL_REQUEST` 母语协议 + 原样命令示例注入 + 严格块解析，不是某个通用后端纠错器；因此修复方向应继续落在 `bridgeManifestTranslator.ts` 这类 translator seam，做 description 护栏保真与弱 schema 收紧，而不是把旧协议逻辑回灌进 Snow core
  - 2026-04-01 已完成一组最小 seam 修正：`bridgeClient.ts` 现在会把完整 `BridgeToolExecutionResponse` 包络继续向上传递；`bridgeManifestTranslator.ts` 则补回 legacy 示例头里的自然语言提示，并对显式“禁止额外参数”的 description-derived 命令收紧为 strict schema；对应定向回归 `27 passed` 与 `npm run build:ts` 已通过
  - 同次 reviewer 子代理对上述 4 个文件的收口审查结论为：未发现阻断性或警告性问题，改动仍停留在 `session/vcpCompatibility` 的兼容/适配层，没有把 Bridge/VCP 特有逻辑灌回 Snow core；当前只保留一个观察项：若未来仓库别处开始把 `SnowBridgeClient.executeTool()` 当通用 core 抽象广泛复用，才需要再次复核返回包络的传播边界
  - 2026-04-01 已完成 `tool result 历史摘要化` 第一阶段收口：`toolExecutor.ts` 为工具执行结果新增 `historyContent`，把 `requestId/invocationId/toolId/details/timestamp` 等运输噪声从历史上下文中剥离，并把 bridge/multimodal `content[]` 压平成紧凑文本；主聊天链 `toolCallRoundHandler.ts`、子代理链 `subAgentExecutor.ts` 与 team 链 `teamExecutor.ts` 现统一只把摘要版 tool content 写入后续会话历史，UI 仍保留原始 tool result 展示
  - 同次定向验证已通过：`npx ava source/utils/execution/toolExecutor.test.ts source/utils/execution/subAgentExecutor.test.ts source/utils/execution/teamExecutor.test.ts` = 14 passed；`npm run build:ts -- --pretty false` 通过；`git diff --check` 通过
  - 同次 live 黑盒未能形成有效通过结论：使用 `scripts/fixtures/vcp-blackbox.local-bridge.json` 连续重跑 `bridge` 两次与 `local` 一次均在 SSE 首轮后超时，daemon log 只到 `Create new session`/`绑定连接`，尚无证据可归因到本次 `tool history` 修正；当前应按“黑盒环境未收口”记录，而不是把这次修改误判为已黑盒通过或已确认回归
  - 2026-03-31 已完成 `snow-cli` fork 相对 `snow-cli-raw` 原版的五层边界对照审计：当前未发现 `Critical` 级“深改 Snow Core 主循环 / 打穿五层边界”的事实，仍可继续推进上游合并验证与黑盒收口，但不能再自我描述成“已经完全回到理想边界”
  - 这次对照审计确认的两条真实 `Warning` 级边界外扩如下：`source/utils/core/contextCompressor.ts` 仍直接依赖 `display.ts` 的 `formatVcpContentForTranscript()` 与 `mode.ts` 的 `resolveVcpModeRequest()`；同时 `resolveVcpModeRequest()` 的感知范围已扩散进 `streamFactory.ts`、`subAgentExecutor.ts`、`teamExecutor.ts` 与 `contextCompressor.ts` 等 core 邻近链路，属于可控偏移，但已不是最初设想的最小侵入
  - 同次对照审计也明确了当前仍基本守住 seam 边界的区域：`conversationSetup.ts` 已收口为 `prepareToolPlane()` 接缝，不再自行拼装 bridge/snapshot 细节；`toolExecutor.ts` 按 execution binding 执行，不再在执行器里直接判路由；`api/chat.ts` 的改动主要仍落在 provider/transport adapter seam，而非把 VCP 逻辑直接塞回 Snow 主循环
  - 因此 2026-03-31 后续处理策略改为：先把边界审计事实回写方案包，再继续执行“不改代码”的多轮黑盒取证；只有黑盒再次指向同一层级且证据闭合时，才允许进入对应 seam 的定向修复
  - 2026-03-31 `verify/20260331-origin-main-merge-followup` 上的 `apiConfig.ts` / `mcpToolsManager.ts` 冲突已解：保留五层边界所需的 VCP 配置契约、MCP scope 三态写回、tool cache 单飞刷新、team hash 失效与外部 MCP 并发探测，没有把 `origin/main` 的旧语义直接吃回主链
  - 2026-03-31 已完成上游合并后的针对性审计：`conversationSetup -> toolPlaneFacade -> toolExecutionBinding -> toolExecutor` 主 seam 仍闭合；`mode.ts` forced-chat、`apiConfig.ts` 的 `backendMode/toolTransport/bridgeVcpKey`、`MCPConfigScreen` 的 project/global 写回都还在链上
  - 2026-03-31 为对齐上游 `filesystem-edit` 现状，`toolExecutor.test.ts` 已改为校验 hashline `operations` 契约，并确认 `filesystem-edit_search` 不再作为当前 native edit 入口继续暴露；相关执行层定向测试重新通过
  - 2026-03-31 上游合并后的定向回归已通过：`npx ava source/utils/session/vcpCompatibility/conversationSetupSeam.test.ts source/utils/session/vcpCompatibility/toolRouteArbiter.test.ts source/utils/session/vcpCompatibility/mode.test.ts source/utils/session/vcpCompatibility/bridgeClient.test.ts source/utils/execution/teamExecutor.test.ts source/utils/execution/subAgentExecutor.test.ts source/utils/execution/toolExecutor.test.ts source/ui/pages/configScreen/configDraft.test.ts` = 31 passed；`npm run build:ts -- --pretty false` 通过
  - 2026-03-31 全面对照黑盒已重跑通过：`native + local` session=`566cd925-9f87-4f3e-a373-2250eaa32057`、`vcp + local` session=`c584f56f-ed56-4f89-aaf8-e029c492266c`、`vcp + bridge` session=`381ce03c-9d11-4d0b-a8e6-ecc459d90e5e`、`vcp + hybrid` session=`7a0c5f65-7f46-468c-b505-491b48be62fb`
  - 2026-03-31 `bridge` 黑盒出现过一次模型最终回复不含完整路径的瞬时漂移，但同配置独立复跑与 bridge+hybrid 复跑均已通过；当前更像模型输出抖动，不像工具链或协议再次坏掉
  - 2026-03-31 仍待补的只剩 `team/subAgent` live 黑盒抽样：当前 `subagent-*` 工具在 local plane 可见，`team-*` live 抽样还缺专用 runtime 场景脚本，暂不把 24.4 标记为完成
  - 2026-03-31 已完成 29.3 / 29.4 / 29.5 收口，当前 fresh `hybrid` 黑盒已不再复现 `Unexpected end of JSON input`
  - `toolExecutor.ts` 不再截取“第一个完整 JSON 对象”继续执行；当前改为统一走 `parseJsonWithFix`，对 malformed / 非对象 payload 记录日志并拒绝执行
  - `toolExecutor.test.ts` 已补执行层回放：拼接 JSON 参数现在会稳定返回错误，不再把上游坏流伪装成“正常但参数错”
  - `chatRouteArbiter.ts` / `chatRouteArbiter.test.ts` 已删除；运行时请求方法契约现仅保留 `mode.ts`，`git grep` 已确认仓库内无剩余运行时引用
  - 2026-03-31 fresh `hybrid` 黑盒：`npm run test:vcp:blackbox -- --mode hybrid --timeout-ms 180000` 通过，session=`d6ee3318-49e5-434b-8b63-8eed8baf775d`
  - 对照 `VCPToolBox/DebugLog/archive/2026-03-31/Debug/LogAfterInitialRoleDivider-001617_069.txt` 与 `...001634_634.txt`，本轮未再出现 `filesystem-readfilesystem-read`、`tool_name`、`TOOL_REQUEST` 或 `Unexpected end of JSON input`
  - 2026-03-31 使用 gpt-5.4 并行复核确认：`toolTransport=local` 下反复 `filesystem-read` 不是执行层自动重试；当前 `toolExecutor -> executeMCPTool -> filesystemService.getFileContent` 对单个 tool call 只执行一次，重复更像模型或代理再次发起了新的 tool call
  - 相对 `ork`，`backendMode=vcp` forced-chat 与 `x-snow-*` 头确属 `snow-cli` 新增的 VCP 兼容层偏移；但按当前代码职责，它们只改变出站协议与路由，没有证据证明会在本地把一次 `filesystem-read` 复制成多次调用
  - 相对 `snow-fork`，`source/api/chat.ts` 当前缺失 `index` 隔离、重叠去重与最终 JSON 收口属于修复面，不是本轮“重复 `filesystem-read` / 文件名拼坏”现象的新根因；若症状仍复现，更像运行时未命中最新逻辑或服务端 SSE 分片仍超出现有覆盖
  - 普通 assistant 路径的净化漂移已收口：`useConversation.ts` 现在会在普通 assistant 回复的最终 UI 展示、`conversationMessages` 追加与 `saveMessage()` 持久化前统一接入 `sanitizeAssistantContent()`，不再让 stray `</think>` 或 VCP display shell 落入最终显示和 session
  - `scripts/vcp-blackbox.mjs` 的黑盒口径漂移已收口：脚本现支持显式 `--config` / `VCP_BLACKBOX_CONFIG` 与 `--work-dir`，默认锚定 `PROJECT_ROOT` 而非调用方 `process.cwd()`，并把最终 assistant 回复、重复工具调用与协议泄漏检查纳入通过条件
  - 本轮定向验证已通过：`npx ava --timeout=2m source/hooks/conversation/useConversation.test.ts source/hooks/conversation/utils/assistantContentSanitizer.test.ts`、`node --test scripts/__tests__/vcp-blackbox.test.mjs`、`npm run build:ts -- --pretty false`、`npx ava source/api/chat.test.ts source/utils/execution/toolExecutor.test.ts`、`npm run test:vcp:blackbox -- --mode local --timeout-ms 180000`，以及跨 cwd 的 `local` 对照复验
  - 本机当前解析到的 Snow config 未提供 `bridgeVcpKey`，因此 30.x 只重跑了 live `local` 黑盒；`bridge/hybrid` 的这次改动覆盖依赖脚本单测与显式配置入口，不把“未实跑 bridge/hybrid”伪装成已验证事实
  - 2026-03-31 已补 `scripts/fixtures/vcp-blackbox.local-bridge.json` 作为显式 bridge/hybrid 黑盒配置，不再依赖当前 active profile 是否碰巧带有 `bridgeVcpKey`
  - 2026-03-31 按“先不改代码、继续 fresh 黑盒取证”的新口径，重新以显式 fixture 复跑 `snow -> vcpCompatibility -> Snow tools -> VCPToolBox(chat only) -> NewAPI` 链路：`vcp + local` fresh session=`35f694e1-a3be-4a89-9840-f024c943d602`，命中工具仍为 Snow 本地 `filesystem-read`，未漂移到 `vcp-*`
  - 同轮对照的 `native + local` 也 fresh 通过：session=`552351e6-83c4-4bcc-a8ac-1a1a335bd4b9`，命中 `filesystem-read`，作为 `vcp + local` 的同场景基线，对照结果一致
  - 同轮 `vcp + bridge` fresh 通过：session=`27ef4dc5-5178-458d-a660-ed6ce7ef830e`，按预期命中 `vcp-servercodesearcher-searchcode`，说明当前 bridge 路由与桥接工具暴露链路仍正常
  - 同轮 `vcp + hybrid` fresh 通过：session=`12674918-3e0d-434c-a530-8231176398dc`，本地读文件场景仍优先命中 `filesystem-read`，bridge 搜索场景命中 `vcp-servercodesearcher-searchcode`，符合 `local > bridge` 预期
  - 为排除短时抖动，又重复复跑了一次 `vcp + local`：fresh session=`3c86e349-2f45-45c5-8898-10799d147a83`，仍只出现单次 `filesystem-read`，最终回复直接收口为 `#!/usr/bin/env node`；截至这次复跑，没有再复现 `filesystem-readfilesystem-read`、`Unexpected end of JSON input`、`vcp-serverfileoperator-listdirectory` 抢路由
  - 因此截至 2026-03-31 16:52，新证据更支持“此前异常具备瞬时性或旧上下文污染特征”，暂未在当前 fresh 代码路径上复现为稳定缺陷；下一步继续保留 24.4 未完成，仅因为 `team/subAgent` 定向 live 与更窄日志取证还没补齐，而不是因为当前四模式链路再次失败
  - 2026-03-31 已补一个低风险 seam 清洁修正：新增 `source/utils/session/vcpCompatibility/constants.ts`，把 `toolExecutionBinding.ts`、`toolPlaneFacade.ts` 与 `toolSnapshot.ts` 中重复的 `__default__` 收束为共享常量；本次修正只落在 `vcpCompatibility` 内部，没有再扩大 Snow core 改动面
  - 同次将持续黑盒 fixture 的模型基线从 `kimi-k2.5` 切换为 `glm-5`，避免后续继续把 `kimi-k2.5` 的模型侧异常误判成代码链路缺陷；涉及 `scripts/fixtures/vcp-blackbox.local-bridge.json`、`vcp-blackbox.native-local.json`、`vcp-blackbox-bridge.config.json`
  - 以 `glm-5` 为基线重新 fresh 复跑四模式黑盒：`vcp + local` session=`44caa3a8-2f12-4850-b6ba-f4fce85c3cb6`、`native + local` session=`18de8b88-a420-4730-9a64-c3b02f2544c2`、`vcp + bridge` session=`7d36a749-c8a9-44e3-93d9-f7b924918516`、`vcp + hybrid` session=`692b1909-636e-493f-955f-1b0e14dee61d`，均通过；其中 local / hybrid 仍优先命中 Snow `filesystem-read`，bridge / hybrid 搜索场景仍命中 `vcp-servercodesearcher-searchcode`
  - 本轮定向验证也已通过：`npx ava source/utils/session/vcpCompatibility/toolExecutionBinding.test.ts source/utils/session/vcpCompatibility/conversationSetupSeam.test.ts source/utils/session/vcpCompatibility/toolRouteArbiter.test.ts` = 11 passed；`npm run build:ts -- --pretty false` 通过
  - 2026-03-31 晚间新增一个独立优化面：`SnowBridge` 需要补 Snow-only 来源白名单，原因不是重新打开 `VCPToolBox` 主链，而是 `SnowBridge` 与 `VCPToolBridge` 当前都拦截 `get_vcp_manifests / execute_vcp_tool / cancel_vcp_tool` 这类 WS bridge 消息；仅靠 `Allowed_Clients=snow-cli` 不足以表达“这是 Snow 的 bridge 协议请求”
  - 当前已确认的实施边界是“双边统一，不改聊天主链”：`snow-cli` 只在 `bridgeClient.ts` 发送桥接请求时补 Snow 专属来源元数据，`VCPToolBox/Plugin/SnowBridge` 只消费并校验这份元数据；不把这项识别扩散到 `messageProcessor.js`、`chatCompletionHandler.js` 或 Snow Core 主循环
  - 这项优化的目标不是解决所有 native/local 污染问题，而是先把 `SnowBridge` 的访问面与 `VCPToolBridge` 竞争面隔离干净，避免后续黑盒再把“桥接入口混线”误判成 translator / router / core 缺陷
  - 2026-03-31 晚间已完成 Snow-only bridge 契约第一阶段落地：`snow-cli/source/utils/session/vcpCompatibility/bridgeClient.ts` 现在会在 WS bridge payload 的 `data.requestHeaders` 内发送 `x-snow-client=snow-cli`、`x-snow-protocol=function-calling`、`x-snow-tool-mode=bridge|hybrid`、`x-snow-channel=bridge-ws`
  - 同次 `VCPToolBox/Plugin/SnowBridge/index.js` 已新增 Snow-only 请求校验，并扩展 `config.env(.example)` / `plugin-manifest.json`：默认要求显式 Snow 来源标识，允许的客户端/协议/工具模式/通道均可配置；现有 `Allowed_Clients`、`Bridge_Access_Token`、`Rate_Limit_Per_Minute` 逻辑保持不变
  - 本轮验证已完成最小定向收口：`npx ava source/utils/session/vcpCompatibility/bridgeClient.test.ts` 通过，`npm run build:ts -- --pretty false` 通过，`node --check VCPToolBox/Plugin/SnowBridge/index.js` 通过，且本地脚本已确认 `SnowBridge` 会拒绝 `x-snow-tool-mode=local` 的请求
  - 2026-03-31 晚间 live `SnowBridge` 已确认命中新代码：直接 WS 探针在 `ws://127.0.0.1:6005/vcp-distributed-server/VCP_Key=123456` 上收到 `vcp_manifest_response.data.bridgeVersion=\"2.1.0\"`
  - 同次排查也确认了一个黑盒假阳性来源：`scripts/vcp-blackbox.mjs` 默认优先跑 `bundle/cli.mjs`，而本机 bundle 一度停留在 `2026-03-30 18:24`，晚于源码修正；重新执行 `npm run build` 后，bundle 更新时间回到 `2026-03-31 19:15`，live 黑盒才真正命中本轮 `bridgeClient.ts`
  - `scripts/vcp-blackbox.mjs` 已补运行期会话文件写入竞态容错：将 `Unexpected end of JSON input`、`Unexpected non-whitespace character after JSON` 与 session 文件短暂未落盘视为可重试读取错误，避免把“正在写入中的 session JSON”误判成 runtime 故障
  - 最新 live 黑盒已通过：`node scripts/vcp-blackbox.mjs --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode bridge --mode hybrid --timeout-ms 180000`
    - `bridge` session=`4a595d6e-5d8e-4e05-a5d1-c6db8eafe82c`
    - `hybrid` session=`2d7d6637-461b-47d0-957b-298169830953`
  - 同轮更窄 live 取证也通过：
    - 同 session `hybrid` 两轮对话 session=`e3d8dd2d-5ed3-4362-bab1-03f86bfb5bc6`，第一轮命中 `filesystem-read`，第二轮命中 `vcp-servercodesearcher-searchcode`
    - 反向探针 `x-snow-tool-mode=local` -> `SnowBridge rejected request header "x-snow-tool-mode" with value "local".`
    - 反向探针 `requestHeaders` 缺少必需字段 -> `SnowBridge requestHeaders are missing required Snow metadata.`
  - 因而截至 2026-03-31，31.x 的剩余事实应改写为：`SnowBridge` 的 Snow-only 来源隔离与 live bridge/hybrid 访问都已收口；“完全无头请求会超时”是当前“SnowBridge 不消费非 Snow 请求”的设计结果，不再误记为 bridge 自身失败
  - `scripts/vcp-blackbox.mjs` 已修正两处黑盒口径问题：bridge tool result 现在会从解析后的 JSON 字段集中做归一比较，不再被路径分隔符假失败误伤；local probe 现在返回绝对读文件路径，`--work-dir=H:/github/VCP` 与 `--work-dir=H:/github/VCP/snow-cli` 都可稳定运行
  - live 黑盒已补跑通过：`node scripts/vcp-blackbox.mjs --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode bridge --mode hybrid --timeout-ms 180000` 成功；`bridge` session=`81afaa91-b4a6-405a-96dc-72a81c621d44`，`hybrid` session=`c691aa95-21a3-4053-9248-d392543038f1`
  - 对照 `VCPToolBox/DebugLog/archive/2026-03-31/Debug/LogAfterInitialRoleDivider-082031_475.txt`、`...082040_136.txt`、`...082105_477.txt`，当前 bridge/hybrid 黑盒均未再出现 `filesystem-readfilesystem-read`、`tool_name`、`TOOL_REQUEST` 等旧协议残留
  - `chatRouteArbiter.ts` / `chatRouteArbiter.test.ts` 已再次复核为无运行时引用，当前删除状态符合代码事实，不再保留为待观察孤儿契约
  - 上游合并验证已固定在 `verify/20260331-origin-main-merge-followup` 分支推进，禁止直接动 `main`；当前 `git merge origin/main` 后仅剩 `source/utils/config/apiConfig.ts` 与 `source/utils/execution/mcpToolsManager.ts` 两处真实冲突待解
  - `toolRouteArbiter.ts` 仍在真实 `prepareToolPlane -> conversationSetup -> toolExecutor` 运行链中，不是孤儿契约；当前真正的风险是 seam/unit 测试仍偏浅，后续仍需补更贴近 runtime 的链路验证
  - 对照 `snow-fork` 也再次确认：team/subAgent 的 `askuser cancelled`、`requirePlanApproval`、`cleanup_team` stale cleanup 等问题在上游/对照仓仍存在，而当前 `snow-cli` 已有对应修正；后续审计不能再按 `snow-fork` 现状误判本分支执行层已回退
  - Snow 已有 x-snow-client / x-snow-protocol / x-snow-tool-mode 头
  - ::Time outbound bridge 已放在 Snow 兼容层
  - local / bridge / hybrid 的注册裁决方向基本成立
  - VCP 显示兼容层与 context transcript 转换方向基本成立，应保留
  - 已确认 `VCPToolBridge` 会与 `SnowBridge` 竞争同一 WebSocket 消息入口；当前作为插件层后续优化项记录，不升级为本轮主阻断
  - 当前黑盒验证以 `SnowBridge` 为唯一 Snow 桥接入口继续推进；`VCPToolBridge` 抢占问题留待插件层审计修正
  - 已完成只读审计：VCPToolBox `messageProcessor.js` / `chatCompletionHandler.js` 当前无需继续写入，保持最小触碰
  - `conversationSetupSeam.test.ts` 已实跑通过，Snow Core 当前仍只通过 `toolPlaneFacade` 接 seam
  - `bridgeManifestTranslator.ts` 已新增，bridge manifest 到模型工具的转换主责已前移到 Snow translator 层
  - `toolSnapshot.ts` 已回归为 translator 结果快照 + bridge binding 存储，不再从 description 正文反推参数，也不再向模型暴露固定 `command`
  - `toolExecutionBinding.ts` 已新增，路由层现在输出 local / bridge binding
  - `toolPlaneFacade.ts` 已新增，`conversationSetup.ts` 只通过 facade 接入 tool plane，不再直连 bridge client/snapshot 细节
  - `toolExecutor.ts` 已改为只消费 binding 执行，不再自行调用 route 判定
  - SnowBridge 命令级 `description` 已经过最薄净化，`example` 已不再外送，避免 legacy 协议示例继续上浮到模型层
  - 2026-03-31 文档重写已按代码事实完成：`README_zh.md` 与 `docs/usage/zh/22-25` 已明确当前分支是 `0.8` 测试标准线，不把 `System Prompt` / `Session Policy` 继续夸写成端到端 `1.0` 已完成事实
  - 同次文档口径也已固定：`bridge` = 纯 bridge 工具面，`hybrid` = local + bridge 且 `local > bridge`，`x-snow-*` 与 `x-snow-channel=bridge-ws` 由代码自动注入，不需要用户手工配置
  - 当前需要继续治理而非伪装成“已经完全支持”的兼容面包括：VCP 语法保真审计、`::Time` 最小 outbound 契约审计、display/transcript/session 兼容口径统一，以及文档/测试一致性审计
  - `SnowBridge` 远程 WS 地址覆盖目前仍未实现，只作为 1.0 前优化项记录；设计边界已经明确为“不破坏当前 `baseUrl + bridgeVcpKey` 本地推导链，不削弱 Snow-only 来源校验”
  - `toolSnapshot.test.ts` 与 `toolRouteArbiter.test.ts` 已按新边界修正并通过
  - `~review` 已确认尚存两处需要收尾的真实问题：
    - `bridgeManifestTranslator.ts` 移除了 description 参数声明的兼容翻译，导致纯文本参数描述插件可能退化为空 schema
    - `SnowBridge/index.js` 仍带 legacy 协议感知型 description 清洗，职责略微侵入 translator 边界
  - 本轮已完成全面修复：
    - `bridgeManifestTranslator.ts` 已恢复 description 参数声明翻译，并对 `command/tool_name` 等 transport 字段维持隐藏
    - bridge schema 的 `additionalProperties` 已按来源区分：结构化参数保持严格，description 推断和空参数保持宽松
    - `SnowBridge/index.js` 已收回 legacy 协议清洗，只保留 raw manifest 文本归一化
    - `toolSnapshot.test.ts` 已补充 description 参数回归用例
  - 但当前仍未达到 Snow VCP TUI 1.0 的“协议支持完备”状态：
    - 真实 VCPToolBox 插件主流并非结构化 `parameters`，更多依赖 `invocationCommands.description` 中的参数说明与调用格式
    - 当前 translator 仅完成了基础 description 提参与旧协议示例去噪，还未把常见 VCP 参数描述体例收敛成一套明确、可审计的规则表
    - `static` / `hybridservice` / 历史兼容 manifest 的协议分层结论尚未正式写回方案包，后续容易再次把可桥接工具和非工具型插件混在一起
  - 本轮 translator 协议补完已落地：
    - `bridgeManifestTranslator.ts` 现在显式支持 `pluginType` 分层，`static` 等非工具型插件不会再进入 function-calling tool plane
    - translator 现在兼容 `commandName` / `commandIdentifier` / `command` 三种命令名形态
    - translator 现在可解析 VCP 常见 description 参数体例：Markdown 反引号参数名、`参数:` 项目符号、默认值提示、布尔/数字类型提示
    - 旧协议示例块与 `TOOL_REQUEST` / `tool_name` / `调用示例` 等内容已收口在 translator 清洗，不再污染模型描述或参数提取
    - 对“逗号分隔列表”类历史字符串参数，translator 已保持为 `string`，避免错误推断为 `array` 后破坏现有插件入参契约
    - `SnowBridge/index.js` 仅最小补充 raw `pluginType` 元信息，未回灌 legacy 协议清洗职责
  - 本轮 translator 代码验证已完成：`tsc --noEmit`、translator/toolSnapshot 定向 `ava`、`npm run build` 通过
  - 运行时黑盒抽样尚未在本轮重新执行；后续仅需围绕 translator 新增样本补一轮 bridge/hybrid 抽样即可
  - 黑盒：`vcp + local` = 29 个本地工具、0 重复、0 旧协议污染
  - 黑盒：`vcp + bridge` = 231 个桥接工具、0 重复、0 旧协议污染，`ServerCodeSearcher.SearchCode` 经 SnowBridge 成功执行
  - 黑盒：`vcp + hybrid` = 260 个工具、0 重复、0 旧协议污染
  - 黑盒：`native + local` = 29 个本地工具、0 重复、0 旧协议污染
  - 后端日志已确认本轮 `get_vcp_manifests / execute_vcp_tool` 由 `SnowBridge` 拦截，未再被 `VCPToolBridge` 抢走
  - `tsc --noEmit`、`ava` 定向测试、`npm run build` 已通过
  - `~review` 收尾审计发现的两处问题已修正：辅助 AI 调用链已统一接回 VCP translator；配置页 direct text field 已支持 `Esc` 退出
  - 本轮复验已通过：`tsc --noEmit`、`ava mode/types 定向测试`、`git diff --check`、`npm run build`
  - 本轮收尾修复已补齐两处运行时一致性问题：
    - `toolPlaneFacade.ts` 在 `hybrid` 模式下若 `SnowBridge` manifest 拉取失败，会清理旧 bridge snapshot / execution bindings，并退化为仅本地工具平面；`bridge` 模式仍保持失败即失败
    - `toolRouteArbiter.ts` 现在会按每个 source 实际保留下来的工具集合同步裁剪 `servicesInfo` 与 `executionBindings`，避免 MCP 面板和 tool_search 继续显示已被 `local > bridge` 裁掉的工具
  - 本轮回归已通过：
    - `ava source/utils/session/vcpCompatibility/toolRouteArbiter.test.ts`
    - `tsc --noEmit`
    - `npm run build`
  - 本轮补充了 translator 正则清洗的真实运行时残留修复：
    - `bridgeManifestTranslator.ts` 现在会先归一化字面量 `\\n` / `\\r\\n` / `\\t`，再做 legacy 协议清洗与参数提取
    - `tool_name=` 这种历史示例写法已纳入 legacy 行判定，不再漏出到模型 description
    - `bridgeManifestTranslator.test.ts` 已新增 escaped-newline + `tool_name=` 回归样本
  - 本轮 10.6 收尾验证已完成：
    - `tsc --noEmit`
    - `ava source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts source/utils/session/vcpCompatibility/toolSnapshot.test.ts source/utils/session/vcpCompatibility/toolRouteArbiter.test.ts source/utils/session/vcpCompatibility/mode.test.ts`
    - `npm run build`
    - 运行时黑盒抽样：SnowBridge live manifest `rawLegacyCommandCount=6`，translator 后 `translatedLegacyToolCount=0`
  - 本轮 `~review` 发现的执行链与配置页偏移已纳入当前修复面：
    - `subAgentExecutor.ts` 与 `teamExecutor.ts` 将收回到 `prepareToolPlane` + binding-aware 执行路径，不再旁路 `collectAllMCPTools/executeMCPTool`
    - teammate 的 `requirePlanApproval` 将改为按真实本地写入/执行工具集合判定，移除名称子串模糊拦截
    - teammate 会重新接回 `requestUserQuestion`，避免 `askuser-*` 在队友链路直接报错
    - 配置页将移除不可达的旧 `Select` 分支，并用统一的字段 helper 消化数值/开关判断与孤儿导出
    - 配置页剩余硬编码英文会继续回收进 `i18n`，不再留在组件正文里
  - 当前新增的运行时一致性问题已确认：
    - translator 会从 description fallback 中推断 `number/boolean` 参数类型，但部分 VCP 旧插件在执行层仍要求字符串入参
    - 本轮将把兼容收口放在 Snow 的 translator/executor seam：保留模型可见 schema 提示，同时仅对 description fallback 参数做保守字符串化
    - 结构化 `parameters` 来源继续保持原始类型直通，不把字符串契约强行回灌到所有 bridge 工具
  - 2026-03-30 本轮临时试探的 `mode.ts`“保留真实 requestMethod”修正已回退，`mode.test.ts` 也已恢复到当前 forced-chat 契约
  - 当前重新按五层边界排查：第一责任嫌疑固定为路由层（VCP 模式统一压入 `chat` adapter），第二责任嫌疑为 translator / display 兼容链是否把 tool call 文本化或回流污染；在这两层未证伪前，不进入 Snow core 修补
  - 2026-03-30 针对最新污染样本重新对比 `official/main` 后确认：`streamProcessor.ts` / `useConversation.ts` / `toolCallProcessor.ts` 的“assistant 正文直接保存”缺口并非本分支后续 VCP 修补新引入，工具轮保存链与上游一致，VCP 相关改动主要只加了出站转换与流式显示抑制
  - 最新日志与 session 交叉取证已确认：`</think>` 与“让我先查看/让我深入...”这类内容先写入 Snow session，再进入 VCPToolBox；当前将修复边界收束为 Snow 会话保存 seam 的正文净化，不把 router / translator / bridge 职责重新回灌到 core
  - 本轮会话保存 seam 修复已落地：
    - 新增 `assistantContentSanitizer.ts`，统一去除完整/残缺 `think` 标签泄漏与 VCP display protocol shell
    - `useConversation.ts` 与 `toolCallProcessor.ts` 现在在 assistant message 保存前统一净化正文，避免污染继续写入 session
    - `assistantContentSanitizer.test.ts` 已补充 orphan `</think>`、完整 `<thinking>`、VCP TOOL_REQUEST 壳层回归样本
    - 定向验证已通过：`ava source/hooks/conversation/utils/assistantContentSanitizer.test.ts`、`tsc --noEmit`、`git diff --check`
  - 本轮 bridge 字符串入参契约修正已落地：
    - `bridgeManifestTranslator.ts` 会把 description fallback 参数同步标记到 bridge binding 的 `stringifyArgumentNames`
    - `toolExecutor.ts` 在调用 SnowBridge 前会按 binding 对 description fallback 参数做保守字符串化，再附加 `command`
    - `toolExecutionBinding.test.ts` 与 `toolSnapshot.test.ts` 已补充契约回归，确认 structured 参数不被误伤、description 参数执行前会降级为字符串
  - 本轮代码侧验证已完成：
    - `ava source/utils/session/vcpCompatibility/toolExecutionBinding.test.ts source/utils/session/vcpCompatibility/toolSnapshot.test.ts source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts`
    - `tsc --noEmit`
    - `git diff --check`
  - 本轮运行时黑盒复验已完成：
    - HTTP 状态探测：`/api/plugins/SnowBridge/status` 返回 `active / hooked / bridgeEnabled=true`
    - 原始 WS 握手：`ws://127.0.0.1:6005/vcp-distributed-server/VCP_Key=123456` 可收到 `connection_ack`
    - manifest 黑盒：原始 WS `get_vcp_manifests` 返回成功，当前 translator 产物为 `231` 个 bridge tools
    - 执行黑盒：`vcp-servercodesearcher-searchcode` 在原始入参 `{context_lines: 1, case_sensitive: false}` 下，经 binding 归一化为 `{context_lines: "1", case_sensitive: "false"}` 后执行成功
    - hybrid 复验：`localToolCount=29`、`bridgeToolCount=231`、`hybridToolCount=260`、重复数 `0`
    - 旧协议污染复验：以 `TOOL_REQUEST` / `tool_name` / `<<<[` 为收严口径时，`bridge=0`、`hybrid=0`
  - 黑盒过程中额外确认：
    - `prepareToolPlane()` 的直接脚本调用在本地调试链路中不稳定，不作为本轮 bridge 契约黑盒主口径
    - 采用“原始 WS -> 当前 translator/binding -> 原始 WS execute”更能精准覆盖本次修正面，也避免把无关加载链路噪声混入结论
  - 本轮性能平行收口已落地：
    - `toolPlaneFacade.ts` 已改为并行准备 bridge manifest 与本地工具平面，避免 hybrid 被 SnowBridge 串行阻塞
    - `bridgeClient.ts` 已增加按连接键的 manifest 短 TTL 缓存与并发请求复用，减少同一会话内重复 WS manifest 往返
    - `mcpToolsManager.ts` 已增加共享 refresh promise、配置 hash 检查节流、TODO 单次初始化与外部 MCP 并行探测，降低 `collectAllMCPTools/getMCPServicesInfo` 热路径抖动
  - 本轮代码侧验证结果：
    - `tsc --noEmit` 通过
    - `git diff --check` 通过
    - `npm run build` 的 TypeScript 与 bundle 阶段通过，但清理产物时命中本地文件占用；属于运行环境问题，不是本轮代码编译错误
  - 本轮正式黑盒入口已补齐：
    - 已新增 `scripts/vcp-blackbox.mjs`
    - 已新增 `npm run test:vcp:blackbox`
    - 已新增 `npm run test:vcp:blackbox:perf`
    - 黑盒脚本会主动断开 `SnowBridgeClient` 长连接，避免一次性测试进程因 WS 常驻而看起来“卡死”
  - 本轮性能黑盒结论已收口：
    - `local` 冷启动约 `13.64ms`，热路径约 `0.10ms`
    - `bridge` 冷启动约 `28.77ms`，热路径约 `5.96ms`
    - `hybrid` 冷启动约 `19.26ms`，热路径约 `5.61ms`
    - 近期“黑盒很慢”的主因不是主链回退，而是旧测试夹具没有退出桥接长连，以及并行跑两个 `npm` 黑盒脚本时 Windows 文件占用竞争
  - 本轮已补一处值得当前修复的真实稳定性问题：
    - `mcpToolsManager.ts` 现在为 probe 与 persistent client 的 `stdio` 连接补上超时保护，避免未来接入卡死型外部 MCP 时首连长期悬挂
  - 本轮已复核 Nova 提到的深层风险，当前分级如下：
    - `SnowBridge` monkey patch 脆弱性：真实架构风险，但属于插件边界演进问题，本轮不扩大到 VCPToolBox 主链修补
    - `toolExecutionBinding.ts` / `toolSnapshot.ts` 的会话级 `Map` 缺 TTL：真实中长期维护风险，当前未在黑盒中表现为功能/性能阻断，记录为后续治理项
    - “黑盒慢是 manifest 缓存缺失 / 子代理未传 binding” 已证伪：当前代码已有 manifest cache，子代理/队友链路也已走 `prepareToolPlane` + binding-aware 执行
    - “bridge legacy 污染仍然存在” 已收敛为 translator 规则漏掉 `**调用示例 (...):**` 这一类标题；现已修复并通过正式黑盒复验
  - 本轮稳健治理修复已完成：
    - `SnowBridge/index.js` 已补齐完整生命周期：重复初始化前会先解绑旧事件监听，`registerApiRoutes()` 切换 `wss` 时会先回收旧 patch，`shutdown()` 会执行事件解绑 + monkey patch 卸载 + 运行时状态清理
    - `SnowBridge` 的 monkey patch 现在记录 `patchState`，仅在当前 `wrappedHandler` 仍挂在目标 `wss` 上时才判定“已挂载”，避免热重载或其他插件替换 handler 后误判为已安装
    - `snow-cli` 新增 `sessionLeaseStore.ts`，将 `toolExecutionBinding.ts` 与 `toolSnapshot.ts` 的会话状态收敛为统一的 TTL/扫除式租约存储，消除“平面键已删但 session fallback 仍残留”的孤儿引用风险
    - 当前 TTL 策略为 6 小时租约 + 10 分钟周期清扫，同时保留 `subAgent/team` 显式清理；TTL 作为兜底治理，不改变现有主执行语义
    - 已新增 `sessionLeaseStore.test.ts`，并补充 `toolExecutionBinding.test.ts` 的 stale fallback 回归
  - 本轮治理后的复验结果：
    - 定向 `ava`：`sessionLeaseStore/toolExecutionBinding/toolSnapshot` 共 `14` 项通过
    - `tsc --noEmit` 通过
    - `git diff --check` 通过
    - `npm run build` 通过
    - 正式黑盒 baseline 复验：`local=29`、`bridge=231`、`hybrid=260`，重复与旧协议污染仍为 `0`
    - 正式黑盒 perf 复验：`local cold=14.27ms / warm=0.11ms`、`bridge cold=37.48ms / warm=6.79ms`、`hybrid cold=22.44ms / warm=6.21ms`
  - 本轮 `~review` 追加核实并修正了 1 条真实代码缺口：
    - `teamExecutor.ts` 之前在 teammate 路径包装 `requestUserQuestion` 返回值时遗漏了 `cancelled`，导致 `askuser-*` 在队友链路下用户取消时无法正确回流执行层取消分支
    - 当前已统一改为通过 helper 透传 `selected/customInput/cancelled`，不再让 teammate 路径和主执行链出现语义漂移
    - `teamExecutor.test.ts` 已新增取消态回归测试，防止后续审计继续把“已修问题”当成现状
  - 本轮验证范围仅覆盖代码与定向测试，不把未复跑的 team/subAgent 黑盒结果冒充为已验证事实
  - 本轮继续复核 Nova 提到的 5 条“深层问题”后，当前代码事实为：
    - `toolSnapshot.ts` / `toolExecutionBinding.ts` 的会话状态 Map 泄漏说法已过期；当前已改为 `SessionLeaseStore`，带 6 小时 TTL 与 10 分钟 sweep
    - binding 查找“stale session fallback” 说法已过期；当前 `SessionLeaseStore.getResource()` 会在资源缺失时同步清理失效 session alias
    - `bridgeClient.ts` “WebSocket 未复用”说法不成立；当前同配置连接与 pending manifest 请求都可复用，空闲断连后下一次请求会重连
    - `SnowBridge` monkey patch 风险仍属真实插件边界风险，但已补生命周期回收与挂载态校验，不再是裸 patch 状态
    - bridge 参数字符串化的 `BigInt` / 循环引用更多属于边缘兼容议题，当前未在现有桥接契约与黑盒中表现为阻断问题
  - 本轮已核实并收口 3 条真实问题，且都保持在五层边界或 seam 内：
    - `sseManager.ts` 的 `saveMessage()` 之前未复用 assistant 正文净化，当前已在 SSE 持久化前接入 `sanitizeAssistantContent()`；属于会话保存 seam 修复，不涉及 Snow 推理核心
    - `subAgentExecutor.ts` 之前只过滤模型可见工具，不同步收窄 execution binding；当前已通过 `toolExecutionBinding.ts` 的过滤 helper 派生受限 tool plane，避免子代理看到/能执行的工具面漂移
    - `bridgeManifestTranslator.ts` 现在会额外跳过 `commandIdentifier` / `commandName` / `toolId` 以及固定值语义的 `action` transport 字段，继续把协议杂质收在 translator，不回灌 bridge/core
  - 本轮代码侧验证已通过：
    - `ava source/utils/session/vcpCompatibility/toolExecutionBinding.test.ts source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts source/hooks/conversation/utils/assistantContentSanitizer.test.ts`
    - `tsc --noEmit`
    - `git diff --check`
  - `subAgentExecutor.test.ts` 仍会触发 AVA + `ts-node/esm` 入口超时，属于既有测试基础设施不稳问题；本轮不把它误判为上述三条修复失败
  - 本轮又确认并修复了 1 条此前未覆盖的真实一致性缺口：
    - `toolExecutor.ts` 的 `team-*` 主入口之前仍会在转发 `requestUserQuestion` 时丢失 `cancelled`
    - 当前已新增 `createTeamUserQuestionAdapter()`，让主 `team` 入口与 teammate 路径统一透传 `selected/customInput/cancelled`
    - `toolExecutor.test.ts` 已新增取消态回归，避免后续再把“已修问题”当成当前风险
  - 本轮继续收尾 2 条真实运行时问题：
    - `subAgentExecutor.ts` 拦截 `askuser-*` 时之前会把 `cancelled: true` 伪装成普通回答文本；当前已统一改为回写 `Error: User cancelled the question interaction`，不再让子代理把取消态当正常输入继续推进
    - `mcp/team.ts` 的 `cleanupTeam()` 之前只依赖单一 `getActiveTeam()`，对 runtime active team / 磁盘残留 active team 配置的生命周期漂移不稳健；当前已改为合并 `teamTracker` 与全部 active team 配置做清理目标解析，允许一次回收 stale team 残留
    - 上述 `cleanup_team` 残留问题的更深层根因也已定位：`teamConfig.ts` 仍在 `getActiveTeam()/listActiveTeams()/deleteTeamData()` 中使用 `require('fs')`，在当前 ESM 运行链里会被静默吞掉，导致 active team 枚举与清理有机会直接失效；当前已改为显式 `fs` import
  - 2026-03-30 本轮新的工具调用坏帧已再次定责：
    - 最新样本里的 `filesystem-readfilesystem-read` 与双 JSON `arguments` 已确认先写入 Snow session，再进入 `VCPToolBox`
    - `VCPToolBox/modules/handlers/streamHandler.js` 当前对初始上游 SSE 仍是按行直通转发，不负责 tool call 名称/参数拼接
    - 当前主责任层已从五层兼容层收窄到 `snow-cli/source/api/chat.ts` 的 OpenAI-compatible SSE tool delta 聚合策略
    - `chat.ts` 原实现直接对 `function.name/arguments` 做 `+=`，当上游重复发送完整值而非纯增量时会拼出重复 tool 名与双 JSON 参数
    - 该聚合逻辑与 `official/main` 一致，不是本分支 VCP 五层改造新引入；本轮修复仍限定在 `chat` adapter seam，不回灌到 translator/router/core
  - 本轮 chat adapter 稳定性修复已落地：
    - `source/api/chat.ts` 已新增稳健聚合 helper，兼容重复完整值、较长完整值重发与重叠片段，不再对 tool name / arguments 无脑 `+=`
  - 本轮边界层性能债已顺手收口两处：
    - `sessionLeaseStore.ts` 已改为“按键即时过期检查 + 到期才全表 sweep”，`getResource()` 不再每次读取都扫描全部租约
    - `bridgeClient.ts` 的 manifest cache 已补齐过期剔除与 100 条上限，避免长时多端点运行时只靠 TTL 被动回收
    - 定向验证已通过：`ava sessionLeaseStore/bridgeClient`、`tsc --noEmit`
    - `source/api/chat.test.ts` 已新增回归样本，覆盖重复完整 tool name、完整参数 JSON 重发与 partial-prefix -> full-value 升级场景
    - 定向验证已通过：`npx ava source/api/chat.test.ts`、`npx tsc --noEmit`、`git diff --check`
    - 正式 `npm run test:vcp:blackbox` 本轮未完成端到端确认：当前阻塞点已变为 `hybrid` 运行期 `Unexpected end of JSON input`，需与旧的 malformed tool-call 症状区分处理
  - 本轮对 Nova 新补充的 8 条说法复核结论：
    - `mcpToolsManager.ts` “每次 collectAllMCPTools 都全量重建缓存” 说法不成立；当前 `ensureToolsCacheReady()` 在缓存有效时直接返回缓存，并带 `cacheRefreshPromise` 复用
    - `toolPlaneFacade.ts` “bridge/local 串行阻塞” 说法不成立；当前 bridge manifest 与 local tool plane 已并行准备，hybrid 下 bridge 失败会显式清理旧快照并回退 local-only
    - `mcpToolsManager.ts` TODO 初始化首刷阻塞属实现现状，但只是单次初始化成本，不是“每次调用都阻塞”的现行 bug
    - `mcpToolsManager.ts` “外部 MCP 探测串行化” 说法不成立；当前外部服务探测已走 `Promise.all`
    - `toolPlaneFacade.ts` “fallback 泄露旧 binding” 说法已过期；当前 bridge 失败路径会先 `clearBridgeToolSnapshotSession()` 与 `clearToolExecutionBindingsSession()`
    - `sessionLeaseStore.ts` 的 `dispose()` 未被主流程调用属可讨论的进程级收尾点，但当前 TTL+sweep 已处理运行期租约，不构成本轮所述的会话泄漏现状
    - `subAgent` 的 binding-aware 传递从代码上成立：`prepareToolPlane(...sessionKey=toolPlaneSessionKey)` 与 `executeToolCall(..., toolPlaneSessionKey)` 已成对接通；此前缺的是运行时取消态验证，不是 binding key 漏传
    - `team` 的 `requirePlanApproval` 绑定查找从代码与黑盒上都已成立：teammate 路径使用 `instanceId` 作为会话键，且黑盒已确认本地可变更工具会被真实阻拦
  - 本轮复验结果：
    - `ava sessionLeaseStore/toolExecutionBinding/teamExecutor/toolExecutor` 通过（12 tests passed）
    - `tsc --noEmit` 通过
    - `git diff --check` 通过
    - 底层 `node --loader=ts-node/esm/transpile-only scripts/vcp-blackbox.mjs` 通过：`local=29`、`bridge=231`、`hybrid=260`，重复与旧协议污染均为 `0`
    - 底层 `node --loader=ts-node/esm/transpile-only scripts/vcp-blackbox.mjs --perf` 通过：`local cold=14.92ms / warm=0.14ms`、`bridge cold=33.55ms / warm=6.07ms`、`hybrid cold=21.97ms / warm=6.05ms`
    - `npm run test:vcp:blackbox*` 仍会偶发附带 Windows 本地文件占用噪声；当前以底层 `node` 直跑结果作为本轮黑盒口径
  - 本轮最新复验补充：
    - `tsc --noEmit` 通过
    - `ava subAgentExecutor/teamExecutor/toolExecutor/team.test.ts` 通过（9 tests passed）
    - `npm run test:vcp:blackbox` 通过：`local=29`、`bridge=231`、`hybrid=260`，重复与旧协议污染仍为 `0`
    - `cleanup_team` 运行时探针已通过：修复后可一次清理 `runtime active team + stale active teams`，并已实际回收此前残留的 `cleanup-probe-1774779537037-stale`、`team-1774778799803`、`team-1774778807380`
    - 当前 `git worktree list` 只剩主工作树，`listActiveTeams()` 返回空数组
    - `subAgent askuser cancelled` 本轮验证口径为代码修正 + 定向测试；尚未重新跑依赖真实模型调用的整条子代理取消黑盒，不把未执行的链路冒充为已验证事实
  - 2026-03-31 已补充 `backendMode = vcp` 下三种 `toolTransport` 运行语义审计，当前结果与最早的模式设想一致：
    - `toolTransport = local`：`prepareToolPlane()` 基线探测为 `29` 个本地工具、`0` 个 bridge 工具；fresh runtime 黑盒 session=`3b30b83d-d82c-403d-afc8-8e4624c6ea30`，对照 `VCPToolBox/DebugLog/archive/2026-03-31/Debug/LogInput-005059_288.txt`，实际发往 VCPToolBox 的工具集也是 `29` 个、其中 `vcp-*` 为 `0`
    - 该模式当前可明确定义为“Snow 工具平面 + VCP 聊天后端”：继续继承 VCP 的聊天、记忆召回与 `::Time` 感知，但不主动启用 VCP 原生插件，符合“更偏 Snow 的开发模式”原始设想
    - `toolTransport = bridge`：`prepareToolPlane()` 基线探测为 `231` 个 bridge 工具；fresh runtime 黑盒 session=`061d2ae0-fd34-4eca-bd50-af44cdd2ca21`，对照 `LogInput-005148_788.txt` / `LogInput-005208_068.txt`，实际发往 VCPToolBox 的工具集为 `231` 个，且不再携带 `filesystem-read`
    - 该模式当前可视作“SnowBridge 版轻量 vcpchat”：Snow 负责聊天与执行框架，工具面完全来自 SnowBridge，但不具备 VCP TUI 的高级渲染能力
    - `toolTransport = hybrid`：`prepareToolPlane()` 基线探测为 `260` 个工具（`29 local + 231 bridge`）；fresh runtime 黑盒 session=`71c22c10-552f-4d14-b068-f3a7eb08dcc3`，对照 `LogInput-005316_470.txt` / `LogInput-005417_671.txt`，实际发往 VCPToolBox 的工具集同样为 `260`
    - 当前 mixed 模式已经证实“Snow 本地工具 + VCP bridge 工具”可以同轮共存且不发生重复命名污染；但它仍是后续更高优先级黑盒对象，重点继续观察冲突裁决、模型选工具偏移与复杂多轮稳定性
    - 2026-03-31 继续补了 `local` 真实多场景黑盒：fresh session=`717c3146-e276-42ff-b061-544d5f839f37` 显式调用 `subagent-agent_explore` 后，session 已真实记录顶层 `subagent-agent_explore`、子代理内部 `filesystem-read` 与最终 `<div align=\"center\">`；对照 `LogInput-011707_661.txt`（主调用）与 `LogInput-011706_482.txt`（子代理内部调用），当前 `local + subAgent` 链路可真实跑通
    - 同日又以临时 `teamMode = true` 复验 `local + team`：fresh session=`2c7b1678-3b0c-49e5-9a4c-dd6a37d0f12f` 已真实记录 `team-spawn_teammate -> teammate(filesystem-read) -> team-wait_for_teammates -> team-shutdown_teammate -> team-merge_all_teammate_work -> team-cleanup_team -> filesystem-read` 完整链路；对照 `LogInput-012026_499.txt` / `012030_551.txt` / `012034_052.txt`，当前发往 VCPToolBox 的工具集为 `44` 个（含 `15` 个 `team-*`、`6` 个 `subagent-*`），未见 bridge 工具混入
    - `team-cleanup_team` 本轮结果为真实成功：session 中已回写 `cleanedTeams=[\"team-1774891200981\"]`，且 `H:\\github\\VCP\\snow-cli\\.snow\\worktrees\\team-1774891200981\\reader` 已不存在；当前残留目录只剩旧 `cleanup-probe-*` 样本，不属于本轮 fresh team 黑盒
    - 本轮临时自制 SSE 夹具曾抛出一次 `Unexpected end of JSON input`，但同一会话的持久化 session 与 `VCPToolBox` 日志均完整、可解析且链路成功；该异常已归类为测试夹具噪声，不能再拿来反推 Snow/VCP 运行时回归
  - 本轮新增真实运行时核实：
    - fresh 会话下 `tool_search` 会先被 `toolExecutor.ts` 的普通 binding 校验拦截，后端日志已真实记录 `Error: Tool execution binding not found for tool_search`
    - 这会直接阻断 `subagent-agent_explore` 一类“先 `tool_search` 再加载工具”的真实链路，属于执行层入口顺序缺口，不是桥接层或 VCPToolBox 主链问题
    - 本轮修复策略继续保持五层边界：仅在 `toolExecutor.ts` 为 `tool_search` 增加元工具直通，不扩散到 translator/router/bridge，更不修改 `VCPToolBox/server.js` 与 `modules/chatCompletionHandler.js`
    - 修复后需以真实 SSE 请求 + `VCPToolBox` 日志双口径复验：先确认 `tool_search` 不再因 binding 缺失失败，再补跑最小 `subagent-agent_explore` 读文件链
  - 本轮真实 SSE + 后端日志复验已完成：
    - 旧 `3013` 进程仍复现 `tool_search` binding 缺口，证明“直接复用现有会话服务”会被旧运行实例污染，不能作为修复后口径
    - 以新构建代码启动的临时 SSE 守护进程 `3014` 复验后，fresh 会话先出现 `✓ tool_search`，随后真实进入并完成 `✓ subagent-agent_explore`
    - `VCPToolBox` 日志 `[LogAfterInitialRoleDivider-185608_038.txt]` 明确记录本轮先后调用 `tool_search` 与 `tool_search(filesystem-read)`，均成功返回工具清单
    - `VCPToolBox` 日志 `[LogAfterInitialRoleDivider-185610_659.txt]` 明确记录后续真实调用 `subagent-agent_explore`
    - `VCPToolBox` 日志 `[LogOutputAfterProcessing-185611_477.txt]` 明确记录子代理内部执行 `filesystem-read` 成功，返回 `README_zh.md` 第一行 `<div align=\"center\">`
    - 结论：本轮执行层最薄修复已真实打通 fresh 会话的 `tool_search -> subagent-agent_explore -> filesystem-read` 链路，当前结论来自新实例黑盒与后端日志，不再依赖推测
  - 本轮继续核实 Team 黑盒失败原因后，新增确认 1 条更底层的真实配置缺口：
    - `H:\github\VCP\.snow\settings.json` 当前带 UTF-8 BOM，`projectSettings.ts` 之前直接 `JSON.parse(readFileSync(...))` 会整体解析失败并静默回退 `{}`，不是只丢 `teamMode`，而是 `yoloMode/planMode/teamMode` 等项目设置都会一起失效
    - 这正是 fresh Team 黑盒里 “system prompt 仍是普通模式” 与 “collectAllMCPTools() 完全没有 `team-*`” 同时出现的真实共同根因
    - 当前已在 `projectSettings.ts` 补上 BOM 兼容解析；脚本探针已确认在 `cwd=H:\github\VCP` 下重新读取后 `teamMode=true`、`yoloMode=true`
  - 本轮还补了 1 条与 Team 工具面直接相关的次级缺口：
    - `mcpToolsManager.ts` 的工具缓存 hash 之前未纳入 `teamMode`，长活 snow-cli 进程里切换 Team 后可能继续沿用旧工具面
    - 当前已把 `teamMode` 纳入 `generateConfigHash()`，并将 `team-` 补入 `getRegisteredServicePrefixes()`
    - 脚本探针已确认修复后本地工具平面真实包含 `15` 个 `team-*` 工具，`servicesInfo` 中的 `team` built-in service 也已恢复注册
  - 本轮继续收口 1 条真实 prompt/模式链缺口与 1 条真实桥接执行缺口：
    - `contextCompressor.ts` 之前仍硬编码普通系统提示词；当前已改为 `resolveCompressionSystemPrompt()`，从 `projectSettings` 读取 `plan/team/vulnerability` 模式，并通过 `resolveVcpModeRequest()` 选择真实请求方法
    - `systemPrompt.ts` 的 `getSystemPromptForMode()` 之前仍用 ESM 下不可用的 `require(...)`；当前已改为显式 import，`contextCompressor.test.ts` 已锁住普通模式与 Team 模式回归
    - Nova 这轮补充的 6 条说法里，真实成立且值得修的是 `bridgeClient.ts` 两条：取消失败静默吞掉、连接阶段 pre-send abort race；`toolSnapshot.ts` 空值检查、`bridgeManifestTranslator.ts` “类型安全不足”、`sessionLeaseStore.ts` `unref` 风险都不构成当前 bug，JSON parse 只算观测性不足
    - `bridgeClient.ts` 已新增 `sendConnectedRequest()`，`executeTool()` 现在会先连通再做 abort 复检，避免连接阶段 abort 后请求仍继续发出去；`cancelTool()` 不再 `.catch(() => {})` 静默吞错，而是把错误抛给调用方，由 abort 路径显式告警
    - `bridgeClient.test.ts` 已新增两条定向回归：取消传输失败上抛、连接阶段 abort 不再继续 dispatch
  - 本轮正式 runtime blackbox 夹具也已重新对齐真实运行态：
    - 旧 `scripts/vcp-blackbox.mjs` 会把 SSE 展示层事件当成稳定事实，导致明明会话已经成功执行，脚本仍因等待错误事件/清理悬空而卡死
    - 当前脚本已改为：等待 SSE `complete` 后，直接核对同一临时 HOME 下持久化 session 文件里的 `tool_calls/tool results`，不再把 UI 展示事件误当运行态真相
    - 当前脚本也已补齐 bounded cleanup：SSE reader cancel / stream close / child process stop 都带上限，`cmd /c npm run test:vcp:blackbox` 已不再出现 `Detected unsettled top-level await`
  - 本轮还确认并修复了你之前点名要查的 SSE 主入口漏参：
    - `sseManager.ts -> handleConversationWithTools()` 之前没有传 `toolSearchDisabled`，导致 SSE runtime 会话即便项目设置里 `toolSearchEnabled=false`，模型仍可能先走 `tool_search`
    - 当前已在 `sseManager.ts` 从 `projectSettings` 显式传入 `toolSearchDisabled: !getToolSearchEnabled()`，fresh runtime 会话已恢复直接调用 `filesystem-read`
  - 本轮最新验证结果：
    - `ava source/utils/core/contextCompressor.test.ts source/utils/session/vcpCompatibility/bridgeClient.test.ts` 通过（4 tests passed）
    - `tsc --noEmit` 通过
    - `git diff --check` 通过
    - `cmd /c npm run test:vcp:blackbox` 通过：`local` 真实调用 `filesystem-read`，`bridge` 真实调用 `vcp-servercodesearcher-searchcode`，`hybrid` 两者均通过
    - `cmd /c npm run build` 仍会在清理阶段偶发 Windows 文件占用噪声；但 TypeScript 与 bundle 生成已完成，属于环境级噪声，不是本轮代码编译错误
  - 本轮继续按当前代码事实对齐 `opus4.6` 后，新增确认 1 条仍值得落地的真实边界债：
    - `VCPToolBox/chatCompletionHandler.js` 在流式与非流式路径各自内联解析 `<<<[TOOL_REQUEST]>>>`，与 `modules/vcpLoop/toolCallParser.js` 形成三处协议解析源；这条属于真实重复实现，不是审计臆测
    - 当前修复范围保持最小触碰：只把 `chatCompletionHandler.js` 两处重复解析改为复用 `ToolCallParser.parse()/separate()`，并让 `roleDivider.js` 复用 `ToolCallParser.MARKERS`
    - `snow-cli` 侧暂不新增修复，因为 `opus4.6` 对 `snow-cli` 的大部分批评按当前代码事实已不成立或已被之前任务收口
  - 本轮新增 `K2.5 + 6005(VCPToolBox) + Snow local tools` 定向 seam 取证：
    - 历史 `filesystem-readfilesystem-read` 坏样本确实把嫌疑集中到了 `chat.ts` 路径，但此前临时试探的 `mode.ts`“保留真实 requestMethod”修正已经回退
    - 当前代码真实契约仍是：`resolveVcpModeRequest()` 在 `backendMode=vcp` 时固定返回 `requestMethod: 'chat'`
    - 真实运行链调用点仍包括：`streamFactory.ts`、`subAgentExecutor.ts`、`teamExecutor.ts`、`contextCompressor.ts`
    - 因此异机续修时不能再假设“forced-chat 已解除”，而要以当前 `chat` adapter 仍在主链上的事实重新判断
    - 这条事实只说明后续优先级应先压到 `chat.ts` adapter seam，不等于可以跳过 translator / router / display 的边界约束
  - 新增待收尾清理项：
    - `chatRouteArbiter.ts` / `chatRouteArbiter.test.ts` 当前仅剩对照/SSE 辅助测试价值，真实运行链已统一走 `mode.ts`
    - 合并前应核实黑盒与测试夹具是否仍依赖该辅助入口；若不再依赖，则应从仓库中清理，避免继续制造 VCP `requestMethod` 契约漂移
  - 当前已明确后续主流程：
    - 先从当前五层边界已收口的 `snow-cli` 分支切“上游合并验证分支”，不要直接落到 `main`
    - 在验证分支合并最新上游 `snow-cli`
    - 合并后先做一次针对五层边界与 seam 的 `~review`
    - `~review` 通过后再跑一次完整黑盒，确认 `native/local`、`vcp/local`、`vcp/bridge`、`vcp/hybrid` 以及代理链未被上游回灌破坏
    - 只有当上游合并、审计、黑盒三者都通过，才考虑回主线或覆盖 `main`
  - 2026-03-30 深度 `~review` 已完成异机交接级取证：
    - `Critical`：`snow-cli/source/api/chat.ts` 的 OpenAI-compatible SSE tool delta 聚合仍以 `const index = deltaCall.index ?? 0` 兜底；当 provider 并行返回多个 tool call 且未给 `index` 时，多条增量会并到同一槽位。历史坏样本见 `VCPToolBox/DebugLog/archive/2026-03-30/Debug/LogAfterInitialRoleDivider-164122_861.txt` 第 `32-33` 行，已经出现 `filesystem-readfilesystem-read` 与双 JSON `arguments` 拼接。
    - `Critical`：`chat.ts` 在 `yield {type: 'tool_calls'}` 前没有像 `snow-cli/source/api/anthropic.ts` 那样对 `function.arguments` 做最终 JSON 收口；对照 `anthropic.ts` 第 `995-1036` 行已有 `parseJsonWithFix`。当前 `snow-cli/source/hooks/conversation/core/toolCallProcessor.ts` 会把坏参数原样写入 session。
    - `Warning`：`snow-cli/source/utils/execution/toolExecutor.ts` 的 `safeParseToolArguments()` 会在 JSON 损坏时截取第一个完整 JSON 对象继续执行；它不是主因，但会掩盖上游坏流，导致后续排障误以为只是单个参数坏掉。
    - `Warning`：VCP 请求方式契约当前仍 split-brain。`snow-cli/source/utils/session/vcpCompatibility/mode.ts` 在 `backendMode=vcp` 时依旧固定回 `requestMethod: 'chat'`；`chatRouteArbiter.ts` 现在只剩自身测试引用，真实运行链已无人使用。
    - 已证伪：`boundary-corection` 这一批 fresh 失败主要是模型/agent 自己把 `correction` 拼成了 `corection`，不是 Snow 把正确参数缓存污染后改坏。证据链：fresh session `C:/Users/12971/.snow/sessions/snow-cli-0da71b/20260330/bed57d4c-4a57-4171-97a4-83aea36aca08.json` 第 `33-34` 行已是正常 `filesystem-read` + 错路径参数；VCPToolBox 输入日志 `VCPToolBox/DebugLog/archive/2026-03-30/Debug/LogInput-183703_099.txt` 第 `117-125` 行保持同一错误。
    - 当前不能把历史 `hybrid` 运行期 `Unexpected end of JSON input` 视作自然消失：fresh typo 样本没有复现旧坏名，只能说明这个新样本不是同一触发面；老阻塞仍需要在修完 `chat.ts` 聚合/收口后，用 fresh `hybrid` 会话单独复现或证伪。
  - 2026-03-31 对照上游重新核定后确认：Snow Core 与 VCP 适配边界当前主要集中在 `streamProcessor.ts` 的 `applyVcpOutboundMessageTransforms` / streaming suppression、`useConversation.ts` 的普通 assistant 保存链，以及 `sseManager.ts` 的 SSE 入口参数透传
  - 2026-03-31 已将 `api/chat.ts`、`api/models.ts` 与 `vcpCompatibility/*` 的请求传输拼装统一收敛到 `source/utils/session/vcpCompatibility/mode.ts` 与 `source/utils/session/vcpCompatibility/bridgeClient.ts`，并通过这层 seam 统一处理 `x-snow-client` / `x-snow-protocol` / `x-snow-tool-mode` 等 VCP transport 头
  - 2026-03-31 `apiConfig.ts` 已补齐项目级 MCP scope 读取与合并：引入 `MCPConfigScope`、project/global `mcp-config.json` merge，以及 `getMCPConfig()` / `getMCPServerSource()` / `getMCPConfigByScope()`，VCP 相关 `backendMode/toolTransport/bridge*` 语义保持稳定
  - 2026-03-31 `mcpToolsManager.ts` 已继续校正 MCP service 的 `source` / reconnect / 热路径缓存语义，避免 `filesystem-edit` / `filesystem-edit_search` 等本地工具继续被错误地混入外部 MCP 路径
  - 上述收口已完成验证：`npm run build:ts -- --pretty false`、`npx ava source/api/chat.test.ts source/utils/execution/toolExecutor.test.ts source/utils/config/apiConfig.test.ts source/utils/session/vcpCompatibility/mode.test.ts source/utils/session/vcpCompatibility/bridgeClient.test.ts`、`npm run test:vcp:blackbox -- --mode local --timeout-ms 180000`、`--mode bridge`、`--mode hybrid`；fresh session 记录为 `73e4bfa4-7932-4690-b894-4d392896b8f9` / `6cb86637-04f3-4e01-9e55-8f3162e3eae5` / `576d610a-ecac-460a-8a29-e41427f1126f`
  - 2026-03-31 transport / scope / helper 收口后确认：`source/api/chat.ts` 与 `source/api/models.ts` 现在统一走 `vcpCompatibility/mode.ts` 与 `vcpCompatibility/bridgeClient.ts`，不再分散拼装 VCP transport 细节
  - `source/utils/config/apiConfig.test.ts` 已覆盖 `HOME/USERPROFILE + cwd` 组合下的 global/project MCP 配置解析，避免 `process.chdir()` 场景继续误读 `~/.snow`
  - `source/utils/execution/toolExecutor.test.ts` 已覆盖 binding-aware 执行下 `filesystem-edit` / `filesystem-edit_search` 的本地 execution binding 契约，防止回退到旧执行分支
  - `scripts/vcp-blackbox.mjs` 现已支持在 `bundle/cli.mjs` 缺失时于 `bundle` / `dist` / `source/cli.tsx` 之间降级选择入口；local probe 固定读取 `source/cli.tsx`，bridge/hybrid probe 固定校验 `SnowBridge` 搜索结果
  - 由此也排除了旧 blackbox 夹具把 bundle/source 入口差异误判成 runtime 异常的情况；fresh `local` 口径不再把 `source/utils/core/version.ts` / `package.json` 之类样本误当成 `Unexpected end of JSON input` 的证据
next_checks:
  - 先按 `chat.ts` 多 tool delta 缺失 `index` 聚合、最终 `tool_call.arguments` JSON 收口、`safeParseToolArguments()` 观测性收紧、`chatRouteArbiter` 孤儿清理的顺序继续修
  - 以修复后的 fresh SSE 守护进程重跑 `team/subAgent + local/bridge/hybrid` 组合黑盒，并继续联查 `VCPToolBox` 日志确认 Team prompt 与 Team 工具面同时恢复
  - 跑一轮更广的 `subAgent/team + local/bridge/hybrid` 运行时黑盒，确认长会话和代理链对新 TTL 机制没有回归
  - 在允许真实模型调用的条件下，补跑 `subAgent` 的 `askuser-*` 取消/正常回答双链黑盒，作为本轮取消态修正的最终运行时盖章
  - 保持 `toolSnapshot` 与 `SnowBridge` 的职责边界，不再把 legacy 协议知识回灌到执行层
  - 保留 `VCPToolBridge` 抢占 SnowBridge 协议入口为后续插件层优化项
  - 保留 `SnowBridge` 独立远程 WS 地址配置为后续优化项：当前采用 `baseUrl` 推导同源 WS + `bridgeVcpKey`/`bridgeAccessToken` 模型，暂不支持 HTTP 与桥接 WS 分离部署
  - 完成 fresh SSE / 黑盒后，复核 `chatRouteArbiter.ts` 是否还有测试夹具依赖；若无依赖，清理该孤儿 helper 与对应测试，统一只保留 `mode.ts` 作为 VCP requestMethod 契约入口
  - 在当前活跃分支基础上另开“上游合并验证分支”，先合并最新 `snow-cli` 上游，再执行一次 `~review`
  - 上游合并后的 `~review` 重点核对：
    - `vcpCompatibility/*` seam 是否被上游改坏或被新实现旁路
    - `conversationSetup / toolExecutor / subAgentExecutor / teamExecutor / sseManager` 是否出现契约漂移
    - 配置层、测试夹具、SSE/runtime 入口是否把旧 VCP 行为或 translator 旧残留重新带回
  - 上游合并后的全面黑盒矩阵至少覆盖：
    - `native + local`
    - `vcp + local`
    - `vcp + bridge`
    - `vcp + hybrid`
    - `team/subAgent` 抽样链路
```

---

## 任务列表

### 1. VCPToolBox 最小触碰审计
- [√] 1.1 只读审计 `VCPToolBox/modules/chatCompletionHandler.js` 与 `messageProcessor.js` 是否仍残留 Snow 专属越界清洗 | depends_on: []
- [-] 1.2 仅当确认存在残留时，最小回退 `messageProcessor.js` 中超出“禁 legacy 注入”范围的自然语言语义裁剪 | depends_on: [1.1]
- [-] 1.3 保留或恢复 `x-snow-*` 识别与最薄的 legacy 占位符禁用逻辑；若无残留或无需修改则标记跳过 | depends_on: [1.2]

### 2. 模型层清洁化前移
- [√] 2.1 新增 `bridgeManifestTranslator`，统一处理 bridge manifest 到 model tools 的转换 | depends_on: []
- [√] 2.2 去掉 `toolSnapshot.ts` 对 legacy 描述正文的参数推断依赖 | depends_on: [2.1]
- [√] 2.3 去掉模型 schema 中固定 `command` 等桥接 transport 细节暴露 | depends_on: [2.1, 2.2]
- [√] 2.4 让模型可见 description 只保留 function-calling 友好的用途/参数说明 | depends_on: [2.1, 2.2, 2.3]
- [√] 2.5 同步修正 `toolSnapshot.test.ts`，不再把自由文本 description 解析当作目标边界 | depends_on: [2.2, 2.3, 2.4]

### 3. Core 门面化
- [√] 3.1 新增 `toolPlaneFacade`，封装 bridge manifest 拉取、translator 调用、snapshot 构建与清理 | depends_on: [2.1]
- [√] 3.2 将 `conversationSetup.ts` 改为只调用 facade，不再直连 bridge client/snapshot 细节 | depends_on: [3.1]
- [√] 3.3 保持 `conversationSetup` 对 `local / bridge / hybrid` 的最小化应用职责，禁止新增协议转换逻辑 | depends_on: [3.2]
- [√] 3.4 为 Snow Core 增加 seam-only 约束说明与测试口径，避免后续把 translator/router 职责重新灌回核心层 | depends_on: [3.2, 3.3]

### 4. 路由绑定前移
- [√] 4.1 新增执行绑定结构，明确 local-binding / bridge-binding | depends_on: [3.1]
- [√] 4.2 路由层输出 binding，executor 不再自己调用 route 判定 | depends_on: [4.1]
- [√] 4.3 调整 `toolExecutor.ts` 只消费 binding 并执行 | depends_on: [4.2]
- [√] 4.4 同步修正 `toolRouteArbiter.test.ts` 与执行层相关测试口径 | depends_on: [4.2, 4.3]

### 5. SnowBridge 桥接层边界修正
- [√] 5.1 复核 `Plugin/SnowBridge/index.js` 导出的 manifest 字段，明确其只输出 raw manifest，不直接输出模型面工具信息 | depends_on: []
- [√] 5.2 审核并处理命令级 `description/example/invocationCommands` 的 legacy 协议透出问题 | depends_on: [5.1]
- [√] 5.3 仅保留 SnowBridge 的桥接窄职责，不破坏 execute/cancel/status/async callback 协议 | depends_on: [5.1, 5.2]
- [√] 5.4 将模型面清洁化主责前移到 translator/facade，SnowBridge 仅保留最薄 raw manifest 导出安全净化 | depends_on: [2.1, 5.2]

### 6. 黑盒与非回归
- [√] 6.1 执行 `vcp + local` 黑盒，确认模型层不再看到旧协议母语 | depends_on: [1.3, 2.3, 4.3]
- [√] 6.2 执行 `vcp + bridge` 黑盒，确认 bridge 工具描述已清洁且仍可执行 | depends_on: [2.3, 5.4]
- [√] 6.3 执行 `vcp + hybrid` 与 `native + local` 回归，确认边界收口不误伤原有路径 | depends_on: [3.3, 4.3, 5.3, 6.1, 6.2]

### 7. 方案与代码同步
- [√] 7.1 将关键代码事实回写到方案包 `LIVE_STATUS` 与执行备注，明确哪些来自代码审查、哪些来自历史文档 | depends_on: []
- [√] 7.2 在每轮关键修正后同步更新方案包，避免 `.helloagents` 文档继续漂移 | depends_on: [7.1]

---

## 执行备注

- 本方案是对“五层隔离架构”的边界修正版，不再鼓励把协议清洗继续深埋进 `snow-cli` 核心层或 `VCPToolBox` 主链。
- `VCPToolBox` 在本方案中不是主实施面，只允许做“已存在污染的最小回退”，不继续承担 prompt 语义治理。
- `VCPToolBox/chatCompletionHandler.js` 默认视为只读核对项，除非发现缺失的最薄识别能力，否则不作为写入目标。
- `SnowBridge` 在本方案中被定义为“桥接窄职责插件”，只导出 raw manifest，不再作为模型面协议清洁化的长期主实现层。
- `toolSnapshot.ts` 的职责应回归“承接 translator 结果并建立会话快照”，不再兼做 legacy 协议解析器。
- `toolSnapshot.ts` 还必须停止向模型暴露 bridge transport 细节字段，例如固定 `command`。
- `toolExecutor.ts` 的目标状态是“只执行、不判路由”。
- `Snow Core Layer` 只允许 seam 级改动；`conversationSetup.ts` 之类核心邻近文件只能接 facade/binding 结果，不能再直接处理 VCP 协议转换、VCPToolBox 感知或工具路由决策。
- 当前方案已按代码与分支提交同步重审过一次，后续以代码与测试的真实状态为准，不再把旧文档视作当然正确。
- `VCPToolBridge` 抢占 `SnowBridge` 协议入口的问题目前定性为插件层优化项：会阻碍桥接验证，但不改变五层边界主方案，也不要求本轮回写 `snow-cli` 核心或 `VCPToolBox` 主链。
- 本轮已完成代码落地：
  - `snow-cli/source/utils/session/vcpCompatibility/bridgeManifestTranslator.ts`
  - `snow-cli/source/utils/session/vcpCompatibility/toolExecutionBinding.ts`
  - `snow-cli/source/utils/session/vcpCompatibility/toolPlaneFacade.ts`
  - `snow-cli/source/utils/session/vcpCompatibility/toolSnapshot.ts`
  - `snow-cli/source/utils/session/vcpCompatibility/toolRouteArbiter.ts`
  - `snow-cli/source/hooks/conversation/core/conversationSetup.ts`
  - `snow-cli/source/utils/execution/toolExecutor.ts`
  - `VCPToolBox/Plugin/SnowBridge/index.js`
- 本轮验证已完成：
  - `cmd /c node_modules\\.bin\\tsc.cmd --noEmit`
  - `cmd /c node_modules\\.bin\\ava.cmd source/utils/session/vcpCompatibility/toolSnapshot.test.ts source/utils/session/vcpCompatibility/toolRouteArbiter.test.ts`
  - `cmd /c npm run build`
- 本轮追加验证已完成：
  - `cmd /c node_modules\\.bin\\ava.cmd source/utils/session/vcpCompatibility/conversationSetupSeam.test.ts`
  - 运行时黑盒：`vcp + local / bridge / hybrid`、`native + local`
  - 运行时桥接执行：`ServerCodeSearcher.SearchCode` 通过 SnowBridge 成功返回结果
- 后续优化项：
  - `VCPToolBridge` 与 `SnowBridge` 的协议入口竞争仍需在插件层收口，但当前不作为五层边界主阻断
  - `SnowBridge` 当前默认配置模型为 `baseUrl`（HTTP 根地址，同时推导同源 WS）+ `bridgeVcpKey` + `bridgeAccessToken`；后续若要支持云端或网关分离部署，可扩展独立 `bridgeBaseUrl/bridgeWsUrl`，但本轮不进入主实现范围

### 2026-03-30 深审交接备注
- 另一台机器接手时，优先把主阻塞视为 `snow-cli/source/api/chat.ts` 这一个 adapter seam 的流式 tool-call 聚合与参数收口问题，不要重新从 `VCPToolBox/messageProcessor.js` 或 `SnowBridge` raw manifest 重新起步。
  - 当前最可信的历史坏样本是 `VCPToolBox/DebugLog/archive/2026-03-30/Debug/LogAfterInitialRoleDivider-164122_861.txt`：第 `32-33` 行已经能同时看到坏工具名 `filesystem-readfilesystem-read` 和双 JSON `arguments`。
  - 对照锚点已经确认：`snow-cli/source/api/chat.ts` 第 `719` 行仍是 `const index = deltaCall.index ?? 0`，而 `snow-cli/source/api/anthropic.ts` 第 `995-1036` 行已做最终 `parseJsonWithFix` 收口；两者行为不一致。
  - `snow-cli/source/utils/execution/toolExecutor.ts` 的 `safeParseToolArguments()` 当前更像“掩盖坏流”的观测性问题，不建议先动业务执行分支；应该在上游 adapter 聚合与收口修完后，再决定它是改失败语义、加日志，还是完全收紧。
  - `boundary-corection` 这一批 fresh 样本要明确归类为“模型/agent 错路径”，不能把它误判成历史坏 tool-call 的继续复发；但也不能因此宣布 `hybrid` 老阻塞已经消失。
  - 若后续必须继续动 Snow core，请优先限定在 `chat.ts` 这一处已经有证据的 adapter seam；在 translator / router / display 之外，不要再把修复扩散到其他 core 文件。
  - 本轮 `chat.ts` adapter seam 修正已落地：
    - 缺失 `index` 的 OpenAI-compatible 并行 tool delta 不再默认并到槽位 `0`，现改为优先按显式 `index`、`id`，再按同块顺序与字段匹配隔离
    - `tool_calls` 输出前已统一对 `function.arguments` 做 `parseJsonWithFix` 收口，避免 malformed JSON 继续直接落入 session / 执行链
    - `chat.test.ts` 已补 `missing-index + malformed-json` 回归，覆盖本轮修正面
  - 本轮定向验证已通过：
    - `ava source/api/chat.test.ts`
    - `tsc --noEmit`
    - `git diff --check`
  - 29.3 / 29.4 复核结论更新：
    - `toolExecutor.ts` 的 `safeParseToolArguments()` 仍会截取首个完整 JSON，对坏流观测会产生掩盖；在 `chat.ts` 主阻塞修完后仍建议继续收口
    - `chatRouteArbiter.ts` 仍只被自身测试引用，当前依旧是孤儿契约，但删除动作继续放到 fresh `hybrid` 复核之后

### 8. 收尾审计修正
- [√] 8.1 将 `contextCompressor.ts`、`subAgentExecutor.ts`、`teamExecutor.ts` 统一接回 `resolveVcpModeRequest()`，避免辅助调用链绕过 VCP translator | depends_on: [7.2]
- [√] 8.2 修复配置页 direct text field 的 `Esc` 退出行为，并补充对应测试口径 | depends_on: [7.2]
- [√] 8.3 重新执行本轮相关定向测试与类型校验，确认修正未破坏既有五层边界 | depends_on: [8.1, 8.2]

### 9. 全面修复收口
- [√] 9.1 更新 translator，使 bridge 工具在仅提供 description 参数声明时仍能生成可用 schema，同时继续隐藏 `command`/旧 transport 细节 | depends_on: [8.3]
- [√] 9.2 调整 bridge schema 的 `additionalProperties` 策略：结构化参数保持严格，description 推断或空参数保持宽松 | depends_on: [9.1]
- [√] 9.3 收回 `SnowBridge/index.js` 中的 legacy 协议型 description 清洗，只保留 raw manifest 文本归一化 | depends_on: [8.3]
- [√] 9.4 补充 `toolSnapshot.test.ts` 回归测试，并重新执行 `tsc --noEmit`、定向 `ava`、`npm run build` | depends_on: [9.1, 9.2, 9.3]

### 10. Translator 协议支持补完
- [√] 10.1 基于 `dailynote/VCP开发` 手册与 `Plugin/` 真实 manifest，整理 VCPToolBox 当前“可桥接工具协议”的固定形态与历史例外清单 | depends_on: [9.4]
- [√] 10.2 明确 translator 的协议分层规则：仅 `synchronous/asynchronous/hybridservice` 的 `invocationCommands` 进入 function-calling tool plane，`static/systemPromptPlaceholders/vcp_dynamic_fold` 不进入 | depends_on: [10.1]
- [√] 10.3 扩展 translator 的 description 解析规则，覆盖 VCP 常见参数书写体例（`参数:`、项目符号、可选/必需、默认值、布尔/数字/数组类型、`commandIdentifier/command` 双形态） | depends_on: [10.1, 10.2]
- [√] 10.4 建立旧协议清洗规则表：`TOOL_REQUEST`、`tool_name`、`调用格式`、`「始」「末」`、示例块等仅在 translator 以正则 fallback 方式清洗，不回灌 SnowBridge | depends_on: [10.2, 10.3]
- [√] 10.5 补充 translator 定向测试矩阵，覆盖结构化参数、纯 description 参数、`commandIdentifier`、`command`、异步命令、hybridservice 命令、历史例外跳过场景 | depends_on: [10.3, 10.4]
- [√] 10.6 完成 translator 优化后重新执行类型检查、定向测试、构建与黑盒抽样，作为 Snow VCP TUI 1.0 收尾验证依据 | depends_on: [10.5]

### 11. 审计收尾一致性修复
- [√] 11.1 修复 `toolPlaneFacade.ts`：`hybrid` 模式在 bridge manifest 拉取失败时清理旧 snapshot/bindings，并退化为 local-only tool plane | depends_on: [6.3, 8.3]
- [√] 11.2 修复 `toolRouteArbiter.ts`：按 source 实际保留工具同步裁剪 `servicesInfo` 与 `executionBindings`，消除 UI/tool_search 元信息漂移 | depends_on: [4.4, 6.3]
- [√] 11.3 补充 `toolRouteArbiter.test.ts` 并重新执行 `ava`、`tsc --noEmit`、`npm run build`，将本轮修复结果回写方案包 | depends_on: [11.1, 11.2]

### 12. 执行链与配置页收口修复
- [√] 12.1 修复 `subAgentExecutor.ts`：改为通过 `prepareToolPlane` 获取工具平面，并在 regular tool 执行时复用 binding-aware 执行入口 | depends_on: [11.3]
- [√] 12.2 修复 `teamExecutor.ts`：改为通过 `prepareToolPlane` 获取工具平面，接回 `requestUserQuestion`，并用真实写入工具集合替代 `requirePlanApproval` 的字符串模糊拦截 | depends_on: [11.3]
- [√] 12.3 修复配置页：删除不可达的旧 `Select` 分支，统一数值/开关字段判断，并清理剩余硬编码英文显示 | depends_on: [11.3]
- [√] 12.4 回写 `LIVE_STATUS` 与任务统计，记录本轮 review 修正范围，避免后续旧审计继续按旁路状态判错 | depends_on: [12.1, 12.2, 12.3]

### 13. Bridge 字符串入参契约修正
- [√] 13.1 在 translator/binding 层记录 description fallback 参数的执行契约，明确哪些 bridge 参数在执行时需要保守字符串化 | depends_on: [10.6, 12.4]
- [√] 13.2 调整 bridge 执行前的参数整形：仅对 description fallback 参数做字符串化降级，结构化参数继续原样透传 | depends_on: [13.1]
- [√] 13.3 补充定向测试并重跑 bridge/hybrid 抽样，确认旧插件字符串契约恢复且无新增旧协议污染 | depends_on: [13.2]

### 14. 性能平行收口
- [√] 14.1 修复 `toolPlaneFacade.ts`：`hybrid` 模式下并行准备 bridge manifest 与 local tool plane，保持 `bridge` 失败即失败、`hybrid` 失败退回 local-only 的原语义 | depends_on: [11.3, 12.4]
- [√] 14.2 修复 `bridgeClient.ts`：为 `getManifest()` 增加按连接键的短 TTL 缓存与并发请求复用，降低同一轮内重复 WS manifest 获取开销 | depends_on: [14.1]
- [√] 14.3 修复 `mcpToolsManager.ts`：增加共享 cache refresh、配置 hash 检查节流、TODO 单次初始化与外部 MCP 并行探测，减少工具平面热路径阻塞 | depends_on: [14.1]
- [√] 14.4 重新执行类型检查、diff 校验并完成性能相关代码审视，将结果回写方案包，作为本轮 `~review` 依据 | depends_on: [14.2, 14.3]

### 15. 正式黑盒与风险分级收口
- [√] 15.1 新增正式 VCP 黑盒脚本入口与 `npm run test:vcp:blackbox` / `test:vcp:blackbox:perf`，避免后续继续使用不会退出的临时夹具 | depends_on: [14.4]
- [√] 15.2 为 `SnowBridgeClient` 增加主动断连与 manifest cache 清理能力，供一次性黑盒脚本显式释放长连接 | depends_on: [15.1]
- [√] 15.3 为 `mcpToolsManager.ts` 的 `stdio` probe / persistent connect 补超时保护，避免未来外部 MCP 首连卡死影响黑盒判断 | depends_on: [14.4]
- [√] 15.4 跑通正式 baseline/perf 黑盒并形成性能结论：`local=29`、`bridge=231`、`hybrid=260`，重复与旧协议污染均为 `0` | depends_on: [15.1, 15.2, 15.3]
- [√] 15.5 复核 Nova 提到的深层架构风险，区分“本轮已证伪”“记录为后续治理项”“本轮已最小修复”的边界，回写到 `LIVE_STATUS` | depends_on: [15.4]

### 16. 稳健治理修复
- [√] 16.1 重构 `SnowBridge/index.js` 生命周期：事件订阅可重复初始化、可解绑，monkey patch 可安装/卸载并在 `wss` 切换时回收旧状态 | depends_on: [15.5]
- [√] 16.2 新增 `sessionLeaseStore.ts`，将 `toolExecutionBinding.ts` 与 `toolSnapshot.ts` 的会话状态改为 TTL + sweep 租约存储，移除孤儿 session fallback 风险 | depends_on: [15.5]
- [√] 16.3 补充 `sessionLeaseStore.test.ts` 与 stale fallback 回归测试，并完成 `ava` / `tsc --noEmit` / `git diff --check` / `npm run build` | depends_on: [16.1, 16.2]
- [√] 16.4 重新执行正式 baseline/perf 黑盒，确认 `local / bridge / hybrid` 计数、去重与旧协议污染口径保持不变 | depends_on: [16.1, 16.2, 16.3]

### 17. 审计漂移收口
- [√] 17.1 修复 `teamExecutor.ts`：teammate 路径转发 `requestUserQuestion` 结果时补齐 `cancelled` 透传，避免 `askuser-*` 取消态在队友链路丢失 | depends_on: [12.2, 16.4]
- [√] 17.2 补充 `teamExecutor.test.ts` 定向回归，锁定 `selected/customInput/cancelled` 三字段透传语义 | depends_on: [17.1]
- [√] 17.3 回写当前方案包 `LIVE_STATUS`，明确这是已核实并已修正的真实问题，避免后续审计继续引用过时结论 | depends_on: [17.1, 17.2]

### 18. Team 主入口取消态一致性修复
- [√] 18.1 修复 `toolExecutor.ts` 与 `source/mcp/team.ts`：主 `team-*` 入口转发 `requestUserQuestion` 时补齐 `cancelled` 透传，保持与 teammate 路径一致 | depends_on: [17.3]
- [√] 18.2 补充 `toolExecutor.test.ts` 定向回归，锁定主 `team` 入口的 `selected/customInput/cancelled` 三字段透传语义 | depends_on: [18.1]
- [√] 18.3 回写本轮对 Nova 五条问题的代码核实结论与黑盒复验结果，避免继续把过期审计结论当现状 | depends_on: [18.1, 18.2]

### 19. 代理取消态与 Team 清理残留收尾
- [√] 19.1 修复 `subAgentExecutor.ts` 与 `mcp/subagent.ts`：`askuser-*` 取消态不再伪装成普通回答，统一回写执行层错误语义并补齐类型声明 | depends_on: [18.3]
- [√] 19.2 修复 `mcp/team.ts` 与 `teamConfig.ts`：`cleanup_team` 改为同时解析 runtime active team 与磁盘残留 active team，允许一次回收 stale team 生命周期残留 | depends_on: [18.3]
- [√] 19.3 补充 `subAgentExecutor.test.ts` / `mcp/team.test.ts` 并将 Nova 新补充的性能/架构/验证说法核实结果写回 `LIVE_STATUS`，避免后续继续把过期审计当现状 | depends_on: [19.1, 19.2]

### 20. Team 模式配置口径修正
- [√] 20.1 修复 `projectSettings.ts`：兼容 `.snow/settings.json` 的 UTF-8 BOM，避免项目级设置整体解析失败导致 `teamMode` 等开关静默失效 | depends_on: [19.3]
- [√] 20.2 修复 `mcpToolsManager.ts`：将 `teamMode` 纳入工具缓存失效条件，并补齐 `team-` 内置前缀，避免 Team 工具面继续沿用旧缓存 | depends_on: [20.1]

### 21. SSE Runtime 与黑盒口径收口
- [√] 21.1 修复 `contextCompressor.ts` 与 `systemPrompt.ts`：压缩链改为按真实 `plan/team/vulnerability` 模式取系统提示词，并消除 ESM 下 `require(...)` 运行时缺口 | depends_on: [20.2]
- [√] 21.2 修复 `bridgeClient.ts`：取消失败不再静默吞掉，连接阶段 abort 不再在 `ensureConnected()` 之后继续 dispatch 请求，并补齐 `bridgeClient.test.ts` 回归 | depends_on: [20.2]
- [√] 21.3 修复 `sseManager.ts`：SSE 主入口显式传入 `toolSearchDisabled`，避免 runtime 会话在项目设置关闭工具搜索时仍错误先走 `tool_search` | depends_on: [20.2]
- [√] 21.4 重写 `scripts/vcp-blackbox.mjs` 的 runtime 口径：等待 SSE `complete` 后直接核对持久化 session 文件，不再把 UI 展示事件当成真实执行证据，并补齐 bounded cleanup | depends_on: [21.1, 21.2, 21.3]
- [√] 21.5 重新执行 `ava`、`tsc --noEmit`、`git diff --check` 与正式 `npm run test:vcp:blackbox`，确认 `local / bridge / hybrid` fresh runtime 黑盒全部通过 | depends_on: [21.1, 21.2, 21.3, 21.4]

### 22. VCPToolBox 协议解析去重
- [√] 22.1 依据当前代码事实复核 `opus4.6`：确认 `chatCompletionHandler.js` 中流式/非流式两处 `TOOL_REQUEST` 重复解析仍为真实缺陷 | depends_on: [21.5]
- [√] 22.2 回溯审计确认：`VCPToolBox/modules/chatCompletionHandler.js` 当前代码确实已统一复用 `modules/vcpLoop/toolCallParser.js`；但因该实现触碰了 `VCPToolBox` 核心，本项现改记为“历史实现事实 + 边界债说明”，不再作为当前过渡基线推荐继续沿用的修复范式 | depends_on: [22.1]
- [√] 22.3 回溯审计更正：原方案包曾写 `VCPToolBox/modules/roleDivider.js` 已复用 `ToolCallParser.MARKERS`，但当前代码仍手写 `TOOL_REQUEST` marker；本项现改记为“历史结论漂移已留痕”，不再宣称该复用已真实落地 | depends_on: [22.2]

### 23. Snow 孤儿路由入口清理
- [√] 23.1 在 fresh SSE 与后续黑盒全部结束后，复核 `chatRouteArbiter.ts` 是否仍被任何测试夹具或对照链显式依赖；2026-03-31 已再次确认无真实引用 | depends_on: [21.5]
- [√] 23.2 若确认真实运行链与测试夹具均不再依赖，则移除 `chatRouteArbiter.ts` 与 `chatRouteArbiter.test.ts`，统一只保留 `mode.ts` 作为 VCP `requestMethod` 契约入口 | depends_on: [23.1]

### 24. 上游合并验证
- [√] 24.1 从当前五层边界已收口的 `snow-cli` 分支切出“上游合并验证分支”，禁止直接在 `main` 或当前稳定线硬合最新上游；2026-04-05 回溯审计已更正当前实际验证分支为 `verify/20260330-official-main-merge` | depends_on: [23.2]
- [√] 24.2 在验证分支合并最新上游 `snow-cli` 代码，并记录冲突文件与保留点；已确认仅 `apiConfig.ts` / `mcpToolsManager.ts` 发生真实冲突，且最终保留点已按五层边界收口回填方案包 | depends_on: [24.1]
- [√] 24.3 对上游合并结果执行一次针对性 `~review`，核对五层边界、工具平面、执行绑定、SSE/runtime 与配置页是否被回灌或旁路；当前定向审计与 31 项回归均已通过 | depends_on: [24.2]
- [√] 24.4 对上游合并结果执行一次全面黑盒，至少覆盖 `native + local`、`vcp + local`、`vcp + bridge`、`vcp + hybrid` 与 `team/subAgent` 抽样链路；截至 2026-04-03，当时 live 样本已补齐前四项、fresh `subagent` live 与 fresh `team` live。2026-04-05 回溯审计确认，这条结论应理解为“在当时黑盒夹具口径下通过”，不应再表述为当前持续全绿 | depends_on: [24.3]
  - 2026-04-04 补充：已对照 `snow-fork` 的 `v0.7.6` 吸收 `compressionCoordinator` 相关上游并发压缩修复（`useMessageProcessing` / `autoCompressHandler` / `subAgentExecutor` / `subAgentStreamProcessor` / `teamExecutor` + 新增 `compressionCoordinator.ts`），并保留现有 `vcpCompatibility` seam；`npm run build:ts -- --pretty false` 通过，fresh `subagent bridge/hybrid` live 黑盒曾转绿，证明此前一部分 `subagent/team` 阻断确实来自上游压缩并发缺陷，而非本轮五层边界改造独有问题。
  - 2026-04-04 黑盒夹具复核：`scripts/vcp-blackbox.mjs` 已补两条最小收口——其一，对 persisted-session 尚未完全落盘时出现的 `Unexpected top-level tool call count for team scenario`、`Expected exactly one top-level "subagent-agent_explore" tool call` 与缺失内部 tool-call 样本改判为 retryable，避免把会话写盘延迟误报成 runtime 回归；其二，对最终 assistant 纯路径回复仅额外套上外层 markdown 包裹（如 `**Plugin.js**`）时做最小归一，同时把 `team` 场景 prompt 收紧为“单次仅 1 个顶层工具、不得重复已成功步骤”。修正后 `team bridge + hybrid` 组合黑盒已重新通过。
  - 2026-04-04 日志对照：`VCPToolBox/DebugLog/archive/2026-04-04/Debug` 针对本次 `team bridge/hybrid` 复测未再看到 `filesystem-readfilesystem-read`、`Unexpected end of JSON input`、`corection`、`</think>` 等旧协议坏样本；当前剩余噪声主要表现为黑盒提示词/持久化时序层面的偶发漂移，而不是旧协议脏拼接复发。
- [ ] 24.5 仅当上游合并、`~review`、全面黑盒三项都通过时，才进入主线回收或覆盖 `main` 的决策 | depends_on: [24.4]
  - 2026-04-04 当前判断：`team bridge/hybrid` 已转绿，但 `subagent bridge/hybrid` 在 `non-keep-temp` 组合复跑下仍偶发出现夹具/模型漂移，`--keep-temp` rerun 可通过，且未伴随旧协议污染。因此 24.5 继续保持 pending；下一步应优先对 `subagent` 组合黑盒再做一轮针对性稳态复测，再决定是否进入主线回收。

### 41. 2026-04-04 上游 `v0.7.6` / `acac2d1` 同步计划
- [√] 41.1 基于 `snow-fork` 真实差异完成“方案 A：分桶同步”规划，并把同步顺序、冲突热点、五层边界护栏与验证矩阵写回当前方案包 | depends_on: [24.5]
- [√] 41.2 同步桶 1：已吸收 `useKeyboardInput.ts`、`useTerminalFocus.ts`、`FileRollbackConfirmation.tsx`、`ChatScreenPanels.tsx`、`similarity.utils.ts`、`DiffViewer.tsx` 这组低冲突上游改动；同步时曾误把 `package.json` 覆盖成纯上游版本，现已恢复本地 `test:vcp:*` 脚本与 `ava.nodeArguments=--loader=ts-node/esm/transpile-only`；首轮验证 `npm run build:ts -- --pretty false` 与 `npm run test:vcp:blackbox -- --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode local` 已通过 | depends_on: [41.1]
- [√] 41.3 同步桶 2：对照上游 `v0.7.6` 重新收口 `useMessageProcessing.ts`、`autoCompressHandler.ts`、`compressionCoordinator.ts`、`subAgentExecutor.ts`、`subAgentStreamProcessor.ts`、`teamExecutor.ts`，保留现有 `vcpCompatibility` seam 并完成执行链验证 | depends_on: [41.2]
  - 2026-04-04 对照 `snow-fork v0.7.6/acac2d1` 与多名 `gpt-5.4` reviewer 结论后确认：桶 2 的上游压缩并发修复已经在当前工作树中被功能性吸收，`useMessageProcessing.ts` / `autoCompressHandler.ts` / `subAgentExecutor.ts` / `subAgentStreamProcessor.ts` / `teamExecutor.ts` 现阶段都不应被上游整文件覆盖；当前差异主要是本地 `toolPlane / binding / outbound transform / projection` seam。
  - 2026-04-04 定向验证：`npm run build:ts -- --pretty false` 通过；`npm run test:vcp:blackbox -- --suite subagent --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode bridge --mode hybrid` 通过。当前证据支持把桶 2 改判为“上游稳定性修复已吃进，后续不再需要继续补 merge 代码，只需保留 seam 并进入后续 review/黑盒”。
- [√] 41.4 对同步后的工作树执行一次五层边界定向复核，确认上游改动未回灌 `Snow Core` / `vcpCompatibility` / `tool-plane` 职责边界 | depends_on: [41.3]
  - 2026-04-04 多名 `gpt-5.4 high` reviewer 与主窗口交叉复核后，当前未发现“因为 v0.7.6 同步而把 VCP 兼容职责重新灌回 Snow Core”的真实越界。`useMessageProcessing.ts` / `autoCompressHandler.ts` 仅新增 `compressionCoordinator` 主链互斥；`subAgentExecutor.ts` / `subAgentStreamProcessor.ts` / `teamExecutor.ts` 对 `prepareToolPlane / resolveVcpModeRequest / toolExecutionBinding / outbound transform / toolMessageProjection` 的感知，仍属于文档已承认的过渡态外围 seam。
  - 2026-04-04 但边界复核同时坐实 1 条高优先级执行链问题：`compressionCoordinator` 目前不是可重入/计数锁，同一 `id='main'` 重入时会在第一次 `releaseLock('main')` 后被提前解锁。主窗口最小复现已确认：双重 `acquireLock('main')` 后第一次 `releaseLock('main')` 即令 `isCompressing()` 变为 `false`。这属于并发正确性 bug，不属于五层职责回流。
  - 2026-04-04 当前更适合后续抽 facade 但不阻断本项收口的重复链主要有三类：`subAgentStreamProcessor.ts / teamExecutor.ts` 的“请求方式解析 + outbound transform + projection + usage + compression”复合链、`useMessageProcessing.ts / autoCompressHandler.ts` 的主链 auto-compress orchestration 重复、以及 `subAgentExecutor.ts / teamExecutor.ts` 的 tool-plane session bootstrap/cleanup 重复。
- [√] 41.5 使用 `gpt-5.4` reviewer 子代理执行针对性 `~review`，审计性能、孤儿逻辑、无效引用、输入链与黑盒夹具是否因上游同步产生新技术债 | depends_on: [41.4]
  - 2026-04-04 `gpt-5.4 high` reviewer + 主窗口交叉审计后，当前新增/坐实的真实问题分为 5 组：1) `scripts/vcp-blackbox.mjs` 的 subagent/team 判定被放宽，现更偏“自洽”而非“对错”；2) `compressionCoordinator` 提前解锁竞态；3) `toolExecutionBinding.ts` 的 `fileUrlCompatible` 相对路径按主进程 cwd 解析，且未接入 `teamWorktree` 重写；4) `toolMessageProjection.ts` 仅按 `normalizedContent` 去重，会误吞不同 tool/file 的上下文；5) `FileRollbackConfirmation.tsx` 在超窄终端 `terminalWidth < 4` 时会因 `'─'.repeat(terminalWidth - 4)` 抛 `RangeError`。
  - 2026-04-04 曾观察到的版本漂移（`package.json=0.7.6` 但 `node bundle/cli.mjs --version=0.7.5`）已不再成立；2026-04-05 回溯审计确认当前 `snow-cli/package.json`、`snow-cli/bundle/package.json` 与 `node bundle/cli.mjs --version` 已全部对齐到 `0.7.6`。`FileRollbackConfirmation.tsx` 的超窄终端与 no-files 提示问题也已由当前组件测试覆盖，不再适合继续与本条“新增/坐实问题”并列描述。
  - 2026-04-04 非阻断维护债与测试口径问题需更新为当前事实：`useKeyboardInput.ts` 继续依赖 Ink 私有 `internal_eventEmitter`；`useTerminalFocus.ts` 的 `isFocusEvent()` 基本为孤儿接口；`scripts/__tests__/vcp-blackbox.test.mjs` 的真正剩余问题不是入口不兼容，而是曾短暂残留的 3 个 Windows 路径规范化断言漂移。
  - 2026-04-04 主窗口已额外复核并确认：`projectToolMessagesForContext()` 对两条内容相同的 tool message 确实会把第二条压成 `[duplicate tool context omitted ×2]`；`compressionCoordinator` 双重 acquire / 单次 release 的提前解锁也已在本地最小脚本复现；team/subagent 黑盒夹具目前仍需恢复“固定 oracle + teammate 内部证据 + exact final text”这三层约束，不能把当前放宽状态当成最终结论。
  - 2026-04-04 第二轮定向修复与主窗口复核已完成：`compressionCoordinator.ts` 已收口为原子化排队锁，解决同 id 重入提前解锁与不同 id 首抢双持锁；`teamWorktree.ts + toolExecutionBinding.ts + teamExecutor.ts` 已改为按 `instanceId/toolPlaneKey` 取 bridge binding，并仅在键名感知的路径字段上做 `fileUrlCompatible` worktree/file-url 重写；`scripts/vcp-blackbox.mjs` / `scripts/__tests__/vcp-blackbox.test.mjs` 已恢复 team 内部执行证据、plain-text exact、bridge query 语义容错，以及 `node --test` + `ava` 双入口。2026-04-05 低风险修正又补齐了 3 个 Windows 路径规范化断言；当前定向验证 `node --test scripts/__tests__/vcp-blackbox.test.mjs` 与 `npx ava scripts/__tests__/vcp-blackbox.test.mjs` 均为 `37 passed`。
  - 2026-04-04 已补上 `toolMessageProjection.ts` 的真实误去重修复：上下文投影去重键从“仅按 `normalizedContent`”改为“优先按 `tool_call_id + normalizedContent`”，因此不同 tool call 即使摘要文本相同，也不会再被压成 `[duplicate tool context omitted ×N]`；仅同一 tool call 的重复摘要仍会折叠。对应 AVA 已新增“同 summary / 不同 tool_call_id 不去重”用例。
- [ ] 41.6 对同步后的版本执行 `local / bridge / hybrid + subagent / team` 黑盒矩阵，并对照 `VCPToolBox/DebugLog` 收口结论，再决定是否推进 `24.5` 主线回收 | depends_on: [41.5]
  - 2026-04-04 已先行完成一轮 `team bridge + hybrid` 黑盒收口薄修：`scripts/vcp-blackbox.mjs` 现在会为 team teammate prompt 明确传入 worktree-relative probe path、要求“一回合一个 internal tool / 禁止 narration-only prose”，同时移除了 team 最终答案“必须整句字面相等”的过严判定，仅保留“必须包含正确答案且不泄漏协议内容”的运行时约束。
  - 2026-04-04 脚本层验证：`node --check scripts/vcp-blackbox.mjs` 通过；`node --test scripts/__tests__/vcp-blackbox.test.mjs` = `25 passed`。
  - 2026-04-04 keep-temp 取证：bridge session=`f0411502-1c3a-4305-bf4f-cca5d0da07a1` 通过，最终 assistant 规范收束为 `.helloagents\modules\distributed-runtime.md`；hybrid session=`74cc7f91-4bd5-4527-a15d-bcce23cf01e7` 通过，最终 assistant 为 `#!/usr/bin/env node || Plugin.js`。
  - 2026-04-04 正式矩阵复跑：`npm run test:vcp:blackbox -- --suite team --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode bridge --mode hybrid` 已通过，fresh session=`82761ba8-d1cb-46cb-b81d-bdcb73a036e9`（bridge）与 `adf9ced3-1534-43a0-907a-1f11dfe86dbd`（hybrid）。当前更可信的结论是：此前 `team` 阻断主要是黑盒夹具提示词/最终文本判定过敏，而不是已坐实的 Snow Core 回归。
  - 2026-04-04 主窗口继续复核后，已确认上一条“subagent suite 已改为 local + hybrid”不应直接落成当前基线事实：当前主分支代码与 live 结果并不能坐实“bridge 子代理完全不支持”，因为 fresh live 中既出现过顶层 `subagent-agent_explore` 成功，也出现过 bridge 模式下主 assistant 漂移去调用 `vcp-agentassistant-askmaidagent` / `vcp-servercodesearcher-searchcode`。因此这条更准确的结论应收束为：bridge 子代理黑盒目前主要受 bridge 工具面与提示词稳定性影响，尚不能把失败简单归因成 `toolRouteArbiter` 的确定性行为，更不能据此直接删掉 subagent bridge 支持矩阵。
  - 2026-04-04 已补一条真实执行层修复：`teamExecutor.ts` 现在会把 teammate 内部 regular/synthetic tool result 通过 `onMessage -> tool_result` 回送主会话，因此 `SubAgentUIHandler` 能把 teammate 内部工具结果真正写入 session；此前 local team 黑盒失败的直接原因，就是 session 里只有 teammate 内部 `tool_calls`，没有对应 `tool_result`。修复后重新 `npm run build`，`npm run test:vcp:blackbox -- --suite team --config scripts/fixtures/vcp-blackbox.native-local.json --mode local` 已通过，fresh session=`49e4eea0-5aaa-481d-ad34-2a58128a8a63`；`npm run test:vcp:blackbox -- --suite subagent --config scripts/fixtures/vcp-blackbox.native-local.json --mode local` 也通过，fresh session=`586360a3-fd67-4d97-a2d6-bdb1007325f9`。
  - 2026-04-04 bridge live 黑盒当前仍未完全收口，但更像夹具/工具面暴露而非 Snow Core 回归：`subagent bridge` fresh session=`c70c00d2-64a8-4674-940b-ba8536bdc1eb` 会出现主 assistant 顶层直接调用 `vcp-agentassistant-askmaidagent` / `vcp-servercodesearcher-searchcode`，`team bridge` fresh session=`084a96e3-e742-44af-a14f-3a4185da7441` 也会在 team 序列前插入 `vcp-agentassistant-askmaidagent`。现阶段更可信的结论是：bridge profile / prompt 约束仍不足，导致模型在 bridge-only 工具面前优先走 VCP 原生代理工具；下一步应优先继续收紧黑盒夹具提示词或 bridge 工具过滤，不应把这类漂移误判成五层架构下的 Snow Core 缺陷。
  - 2026-04-05 新增一条与 41.6 直接相关的 live 取证结论：真实主窗口已坐实“sub-agent 在长审计任务中触发自动压缩后，会把 internal handover / start a new session 类回复直接展示给用户”。这条问题经对照 `snow-fork` 后确认属于上游 Snow 子代理压缩设计缺陷，不是 `VCPToolBox` 日志链或 VCP translator 把内容改坏。当前薄修已落在 `subAgentContextCompressor.ts` + `subAgentExecutor.ts`，定向验证 `npx ava source/utils/execution/subAgentExecutor.test.ts` 与 `npm run build:ts -- --pretty false` 已通过；41.6 后续黑盒应优先复跑“长上下文 sub-agent 审计”场景，确认 UI 不再泄漏交接话术，再决定是否继续扩大 bridge/hybrid 取证面。
  - 2026-04-05 在不刻意制造超长上下文的回归检查里，`npm run test:vcp:blackbox -- --suite subagent --config scripts/fixtures/vcp-blackbox.native-local.json --mode local` 已通过，fresh session=`04ce0447-b3aa-456a-9215-516f8965b45b`，最终 assistant 正常收束为 `#!/usr/bin/env node`。这说明当前薄修至少没有把常规 local sub-agent 工具链路改坏；剩余待验证的只是不常触发的“压缩后恢复”长上下文场景。
  - 2026-04-05 针对 fresh live session `C:/Users/shiroEirin/.snow/sessions/VCP-a9fcdd/20260405/ad823a4a-d5ed-4da4-886e-b67e794465a3.json` 的只读复核已确认：`29.1 / 29.2` 当时新增的 `source/api/chat.test.ts` 只覆盖“理想化 helper 夹具”（重复完整值、前缀补全、同名双工具 + 稳定 `id`、可修复残缺 JSON），没有覆盖真实坏流里出现的“多工具同轮 + 缺 `index` + 缺 `id` + 不同工具名交错”与“不可修复坏 JSON 最终掉成 `{}`”。
  - 2026-04-05 已对 `snow-cli/source/api/chat.ts` 做一轮保持五层边界的薄修：`resolveStreamingToolCallIndex()` 不再对多工具/缺 `id` 的名字片段激进复用 `deltaCallPosition` 槽位；当前只允许显式 `index`、稳定 `id`，以及“多工具缺 `id` 时仅按顺序续接参数片段”这类低风险续流。对应 `finalizeStreamingToolCalls()` 也已取消 `fallbackValue: {}` 的静默洗白，改为直接丢弃不可修复的坏 tool call，避免再把串台后的坏流伪装成合法空参数。
  - 2026-04-05 定向验证已完成：`npx ava source/api/chat.test.ts` = `9 passed`，新增覆盖“不同工具名交错不再拼成 `filesystem-readterminal-execute` / `terminal-executefilesystem-read`”与“不可修复坏 JSON 直接丢弃、不再掉成 `{}`”；`npm run build:ts -- --pretty false` 与 `npm run build` 也已通过。41.6 下一步应优先复跑 fresh `snow --vcp` live 场景，确认本次薄修确实只收口 adapter seam，而没有扩散到其他 Snow Core 路径。
  - 2026-04-05 fresh live 黑盒矩阵复测（基于 `glm-5` + `scripts/fixtures/vcp-blackbox.local-bridge.json` / `vcp-blackbox.native-local.json`）现已补到最新：`subagent local` 通过，session=`a4fd27c3-2ac5-4058-a26e-d63ddf7b2d1f`；`team local` 通过，session=`8c230901-ef97-43f5-9616-6781d89d6f65`；`subagent hybrid` 通过，session=`edeb7282-d499-4e6e-8571-d54e2e7ed837`；`team bridge` / `team hybrid` 通过，session=`16faf63c-ed93-4e44-8d1c-11beeef148f2` / `cf18af93-b0d7-4879-9f68-191d6d0c7253`。
  - 2026-04-05 当前唯一未收口项是 `subagent bridge` 的 live 不稳定：同配置连续 keep-temp 复跑出现一败一成——失败样本 `C:/Users/shiroEirin/AppData/Local/Temp/snow-runtime-blackbox-oLAwcf/.snow/sessions/snow-cli-0b4c13/20260405/245a7e46-e745-49b5-b837-0adfe7220570.json` 中，主 assistant 顶层直接调用了 `vcp-servercodesearcher-searchcode`，随后还在最终 reasoning 中承认“应该调用 subagent-agent_explore 但实际直接调用了 bridge tool”；成功样本 `.../snow-runtime-blackbox-HVZMTr/.../16292cf4-dc07-4f2a-adc1-6ff1ed98d115.json` 则按预期走了 `subagent-agent_explore -> subAgentInternal vcp-servercodesearcher-searchcode -> final assistant=Plugin.js`。
  - 2026-04-05 因而 41.6 当前更可信的结论是：`subagent bridge` 的剩余阻断更像 bridge-only 工具面下的模型服从性/提示词稳定性漂移，而不是旧协议脏拼接、`chat.ts` 聚合损坏、或 `VCPToolBox` 处理链复发。对照 `VCPToolBox/DebugLog/archive/2026-04-05/Debug/Log*18375*.txt`、`Log*18376*.txt`、`Log*18384*.txt`、`Log*18385*.txt`、`Log*18403*.txt`、`Log*18405*.txt`，本次相关 live 样本中未再出现 `filesystem-readfilesystem-read`、`Unexpected end of JSON input`、`</think>`、`TOOL_REQUEST`、`corection` 等旧坏样本。
  - 2026-04-05 已补一轮脚本化只读取证，避免继续被 UI 与旧文档误导：`scripts/subagent_diagnostics.py session --session C:/Users/shiroEirin/.snow/sessions/vcp-4ff74e/20260405/c28588e0-531d-46b1-bdd7-5ba2b86160ec.json` 明确显示同一 fresh live 会话里既有一次空的 `subagent-agent_explore` 结果（`toolu_functions.subagent-agent_explore:0`, `empty=True`, `usage=12242/54`），也有一次完整长结果（`...:4`, `empty=False`, `result_len=14243`, `think_tags=59`）。因此当前事实应表述为“subagent 存在间歇性空结果与 `</think>` 污染”，不能再写成“subagent 全挂”。
  - 2026-04-05 同步对照 `subAgentStreamProcessor.ts` / `subAgentMessageHandler.ts` 与 live 输出后确认，界面里被误读成“6%-8% 卡住”的数字其实是 `context_usage.percentage` / `Auto-compressing context (%)`，不是子代理任务完成进度。后续黑盒与人工审计都不应再把它当成执行进度条使用。
  - 2026-04-05 已用 `scripts/subagent_diagnostics.py doc-tree` 对 `.helloagents/modules` 与当前活跃方案包做 repo 相对路径复扫；`.helloagents/modules` 现已无失效源码引用，当前方案包原先残留的“旧 requestTransport helper 路径”与“误写到 `source/utils` 下的 `package.json` 路径”也已回写为现代码真实入口，避免子代理继续被旧包诱导去读取不存在文件。

### 25. Snow 会话正文净化收口
- [√] 25.2 新增会话保存 seam 专用 assistant 正文净化 helper，并先接入工具轮 assistant message 保存前；普通 assistant 路径的最终收口已在 30.1 完成 | depends_on: [25.1]
- [√] 25.3 执行定向测试与类型检查，确认修复只影响会话保存净化，不扩散到 router / translator / bridge | depends_on: [25.2]

### 26. Chat Tool-Delta 聚合修复
- [√] 26.1 复核最新坏样本与 `VCPToolBox` 初始流处理，确认 `filesystem-readfilesystem-read` 先出现在 Snow session，`streamHandler.js` 初始流仍是逐行直通，不负责 tool call 名称拼接 | depends_on: [25.3]
- [√] 26.2 修复 `snow-cli/source/api/chat.ts` 的 OpenAI-compatible SSE tool delta 聚合：对重复完整值、较长完整值重发与重叠片段做稳健合并，不再无条件 `+=` | depends_on: [26.1]
- [√] 26.3 补充 `source/api/chat.test.ts` 并完成 `npx ava source/api/chat.test.ts`、`npx tsc --noEmit`、`git diff --check`；同时记录正式黑盒当前仍阻塞于 `hybrid` 运行期 `Unexpected end of JSON input`，待后续单独取证 | depends_on: [26.2]

### 27. 边界层性能债收口
- [√] 27.1 优化 `sessionLeaseStore.ts`：保留 TTL/周期清扫语义，但将热路径 `getResource()` 改为按键即时过期检查，避免每次读取都触发全表 `sweepExpired()` | depends_on: [16.2]
- [√] 27.2 优化 `bridgeClient.ts`：为 manifest cache 增加过期剔除与 100 条上限，避免长时间多连接场景下只依赖 TTL 被动回收 | depends_on: [14.2]
- [√] 27.3 补充 `sessionLeaseStore.test.ts` / `bridgeClient.test.ts` 并重新执行 `npx ava source/utils/session/vcpCompatibility/sessionLeaseStore.test.ts source/utils/session/vcpCompatibility/bridgeClient.test.ts`、`npx tsc --noEmit`，将收口结果回写方案包 | depends_on: [27.1, 27.2]

- [√] 28.1 复核 SSE/runtime 保存链后确认：`sseManager.ts` 本身不是独立净化点，最终 assistant 持久化净化已统一收口到 `useConversation.ts`，避免 `think` / VCP display shell 再次写入 session | depends_on: [25.3]
- [√] 28.2 修复 `toolExecutionBinding.ts` 与 `subAgentExecutor.ts`：为子代理按允许工具集派生受限 execution binding plane，保持模型可见工具与真实执行集合一致 | depends_on: [12.1, 27.3]
- [√] 28.3 修复 `bridgeManifestTranslator.ts`：扩展 description transport 字段过滤范围，并补充回归测试覆盖 `commandIdentifier` / 固定值 `action` 场景 | depends_on: [10.6, 27.3]

### 29. 2026-03-30 深审交接待修
- [√] 29.1 复核并修复 `snow-cli/source/api/chat.ts`：provider 并行 tool call 且缺失 `index` 时，不能再默认并到槽位 `0`；至少要保证按 `id/顺序` 隔离，避免历史 `filesystem-readfilesystem-read` 与双 JSON `arguments` 重现 | depends_on: [26.3]
- [√] 29.2 对齐 `snow-cli/source/api/chat.ts` 与 `snow-cli/source/api/anthropic.ts`：在产出 `type: 'tool_calls'` 前补最终 `function.arguments` JSON 收口/修复，并新增 `missing-index + malformed-json` 回归测试 | depends_on: [29.1]
- [√] 29.3 审计并收紧 `snow-cli/source/utils/execution/toolExecutor.ts` 的 `safeParseToolArguments()`：避免继续通过“截取第一个完整 JSON 对象”掩盖上游坏流，至少补清晰日志、测试与失败语义 | depends_on: [29.2]
- [√] 29.4 清理 `snow-cli/source/utils/session/vcpCompatibility/chatRouteArbiter.ts` 的孤儿契约：确认真实运行链只剩 `mode.ts` 后，再决定删除该文件/测试，或把它正式降格为纯测试夹具 | depends_on: [23.2, 29.2]
- [√] 29.5 以 fresh `hybrid` 会话重新做黑盒：在修完 `chat.ts` 聚合/收口后复现或证伪 `Unexpected end of JSON input`，并把“fresh typo 样本不等于历史坏流已消失”的结论正式回写方案包 | depends_on: [29.1, 29.2, 29.3]
### 30. 2026-03-31 Local Runtime 审计收口
- [√] 30.1 修复 `useConversation.ts`：普通 assistant 回复在最终 UI 展示、`conversationMessages` 追加与 `saveMessage()` 持久化前统一接入 `sanitizeAssistantContent()`，补齐无工具路径的会话净化缺口 | depends_on: [29.5]
- [√] 30.2 补充普通 assistant 路径的定向回归测试，覆盖 stray `</think>`、VCP display shell 与 streamingLine 最终替换场景，锁定最终显示/保存语义 | depends_on: [30.1]
- [√] 30.3 收紧 `scripts/vcp-blackbox.mjs`：支持显式 `--config` / `VCP_BLACKBOX_CONFIG` 与 `--work-dir`，默认锚定 `PROJECT_ROOT`，并把最终 assistant 回复、重复工具调用与协议泄漏检查纳入通过条件 | depends_on: [29.5]
- [√] 30.4 执行定向测试、local 黑盒与跨 cwd 对照复验，并回写 `LIVE_STATUS` / `.status.json`，纠正本轮审计发现的普通 assistant 净化漂移与 blackbox 口径漂移 | depends_on: [30.2, 30.3]

### 31. SnowBridge Snow-only 来源隔离
- [√] 31.1 审计并固定 `Snow CLI -> SnowBridge` 的来源契约：在 `bridgeClient.ts` 明确 Snow bridge 请求元数据字段，避免仅靠 `clientInfo=snow-cli` 做弱识别 | depends_on: [24.4]
- [√] 31.2 修复 `VCPToolBox/Plugin/SnowBridge/index.js`：新增 Snow-only 请求校验，拒绝未携带 Snow 来源标识或工具模式不匹配的 bridge 请求，避免与 `VCPToolBridge` 继续竞争同类 WS 消息 | depends_on: [31.1]
- [√] 31.3 更新 `SnowBridge` 的 `config.env.example` / `plugin-manifest.json`，补充新的白名单配置说明，并保持默认行为可控 | depends_on: [31.2]
- [√] 31.4 补充 `snow-cli` 与 `SnowBridge` 两侧定向验证，确认 `bridge/hybrid` 可用、`local` 或缺失必需 Snow 元数据的请求被拒绝，并将结果回写 `LIVE_STATUS` / `.status.json` | depends_on: [31.2, 31.3]

### 32. 1.0 前兼容治理与远程桥接预留
- [√] 32.1 审计并固化 VCP 语法保真兼容边界：按当前代码事实列清 pass-through / suppression / 非承诺支持三类，覆盖 `[@tag]`、`[@!tag]`、`[[...]]`、`<<...>>`、`《《...》》`、`{{Var*}}/{{Tar*}}/{{Sar*}}`、`::Group`、`::TagMemo`、`::AIMemo`、`::TimeDecay`、`::RoleValve`、`::Base64Memo` 等语法；结论已回写 `LIVE_STATUS`，当前不能再把上述大多数语法写成“Snow 已正式兼容” | depends_on: [24.4]
- [√] 32.2 审计并固化 `::Time` 的最小 outbound bridge 契约：确认 `timeContextBridge.ts` 只负责最小续问时间锚点桥接，同时确认 helper 尚未接入真实生产发包链；旧“完整时间语义扩写器”口径已证伪 | depends_on: [24.4]
- [√] 32.3 审计并统一 display / transcript / session 的 VCP 协议显示兼容口径：已明确哪些内容属于 UI 抑制、哪些属于正文净化、哪些只是部分成立的 session policy；当前仍未达到三层完全统一 | depends_on: [30.4]
- [√] 32.4 设计 `SnowBridge` 远程 WS 地址覆盖能力：当前 `bridgeClient.ts` 已支持显式 `bridgeWsUrl` 覆盖，配置页入口已修正为 direct text input，黑盒脚本默认 mode 解析也已支持“仅 `bridgeWsUrl` 无 `bridgeVcpKey`”场景；2026-04-03 以 `bridgeWsUrl` only 临时配置 fresh 复跑 `local/bridge/hybrid` core suite 已通过，证明受控黑盒链路正式接通 | depends_on: [31.4]
- [√] 32.5 将兼容治理审计结果同步回中文文档、黑盒夹具与方案包口径，作为 `1.0` 前收口前置条件，避免继续把 `0.8` 测试标准线误写成正式版；当前 `22/23/24/25 + 0.目录 + README_zh` 已全部按方案包事实对齐 | depends_on: [32.1, 32.2, 32.3, 32.4]

- [√] 32.6 收敛配置页 UI 语义：当前已正式收口为 `backendMode=native` 隐藏 `toolTransport`，bridge 凭据字段仅在 `vcp + bridge/hybrid` 下显示；并以 `types/configDraft + vcpToolPlane` 定向测试和 `build:ts` 锁定契约 | depends_on: [32.5]
- [√] 32.7 补强运行中 UI 的 VCP 工具面标识：当前已在 `StatusLine` 中按当前 profile `snowcfg` 只读投影显示 `Local tools / SnowBridge / Hybrid`；定向测试与 `build:ts` 已通过，fresh `bridge` live 样本已通过，而 `hybrid` 当前仅观察到模型漂移型假失败，尚未发现本次 UI 改动带来的 runtime 回归 | depends_on: [32.5]

### 38. 2026-04-02 32.x 审计后的定向修复
- [√] 38.1 将 `applyOutboundMessageTransforms()` 接入共享 outbound seam：已覆盖主聊天、sub-agent 与 team 的真实发包入口，`::Time` bridge 现已进入生产链，同时未把判定逻辑散落回各 provider adapter | depends_on: [32.2]
- [√] 38.2 回溯审计更正 `timeContextBridge.ts` 的运行时门禁表述：当前实现仍以 `backendMode=vcp` + `requestMethod === 'chat'` 作为生效条件；此前“已完全改为按真实运行时请求语义判门、不再依赖原始 `config.requestMethod`”的说法过满，现已降为代码事实口径 | depends_on: [38.1]
- [√] 38.3 将主 assistant 流式 suppression 接入 display seam：`streamProcessor.ts` 已消费 `display.ts` 的 suppression 决策，不再只靠最终 assistant 替换兜底；修复范围保持在显示链，没有扩散到 tool plane / provider core | depends_on: [32.3]
- [√] 38.4 将 `historyContent` 从 live conversation/session 事实中剥离：raw tool result 已恢复为会话事实，摘要只保留给 transcript / persistence / compression 旁路，transcript 摘要语义不再污染 live 历史 | depends_on: [32.3]

### 39. 2026-04-02 上下文膨胀止血补丁
- [√] 39.1 修复 `toolExecutor.ts` 的 `historyContent` 摘要链：对 `filesystem-read` 自动附加的 notebook 区块只做历史摘要级剥离，不改 raw tool result/UI 展示；并补 `toolExecutor.test.ts` 锁定 notebook block 不再污染后续轮次 | depends_on: [36.1]
- [√] 39.2 将 tool message 投影 helper 下沉到 `source/utils/session/toolMessageProjection.ts`，统一由主工具轮、session 初始化、手动压缩输入、sub-agent 发包与 team 发包复用；避免执行层继续反向依赖 `hooks/conversation/core` | depends_on: [38.4]
- [√] 39.3 修复 active-round / team 顶层 sidecar 闭环：主聊天链继续使用 conversation/history 双路径，sub-agent 与 teammate 发包前统一投影 `historyContent`，`team-*` / `subagent-*` 顶层结果也补齐 `historyContent`；并通过 `ava` + `build:ts` 定向验证 | depends_on: [39.1, 39.2]

### 33. 2026-04-01 SnowBridge 状态与护栏收口
- [√] 33.1 修复 `snow-cli/source/utils/session/vcpCompatibility/bridgeClient.ts`：`executeTool()` 不再只返回裸 `result`，而是保留完整 `BridgeToolExecutionResponse` 包络，避免模型侧丢失 `status/asyncStatus` 完成语义；并补 `bridgeClient.test.ts` 回归 | depends_on: [31.4, 32.5]
- [√] 33.2 修复 `snow-cli/source/utils/session/vcpCompatibility/bridgeManifestTranslator.ts`：在继续抑制 legacy `TOOL_REQUEST` 协议噪声的同时，保留示例头中的自然语言提示，并对显式“禁止额外参数”的 description-derived 命令收紧 `additionalProperties=false`；并补 `bridgeManifestTranslator.test.ts` 回归 | depends_on: [32.5]
- [√] 33.3 使用 reviewer 子代理对 `bridgeClient.ts` / `bridgeManifestTranslator.ts` 及对应测试做五层边界复核，确认本次改动仍停留在 `vcpCompatibility` seam，没有回灌 Snow core | depends_on: [33.1, 33.2]

### 34. 2026-04-01 Tool Result 历史摘要化收口
- [√] 34.1 修复 `snow-cli/source/utils/execution/toolExecutor.ts`：为原始 tool result 增加 `historyContent`，将 bridge envelope 与 multimodal `content[]` 摘要化后用于历史上下文，剥离 `requestId/invocationId/toolId/details/timestamp` 等运输噪声，同时保留 UI 使用的原始 `content` | depends_on: [33.3]
- [√] 34.2 修复 `toolCallRoundHandler.ts`、`subAgentExecutor.ts` 与 `teamExecutor.ts`：主聊天链、子代理链和 team 链统一改为只把 `historyContent` 写入后续消息历史，避免原始大表格、目录列表和桥接元数据继续放大上下文 | depends_on: [34.1]
- [√] 34.3 补充 `toolExecutor.test.ts` 并重跑 `ava` / `npm run build:ts` / `git diff --check`，确认本次修改仍停留在 execution/session seam，未触碰 provider/chat core 主语义 | depends_on: [34.2]
- [√] 34.4 以 `v0.7.4` 合并后的当前版本重跑 `local / bridge / hybrid` live 黑盒并收口：在确认 `6005` 已启动后，按同一 fixture 复跑 `local x2 / bridge x2 / hybrid x2` 全部通过；此前 6/6 超时样本已改判为环境假失败 | depends_on: [34.3]

### 35. 2026-04-01 v0.7.4 合并后 SSE 阻断取证
- [-] 35.1 审计 `snow-cli` 的 SSE/runtime 主链：原计划基于“6/6 稳定阻断”继续深挖，但在确认 `6005` 未启动后，该阻断已证伪为环境错误，本项暂不继续推进 | depends_on: [24.4, 34.4]
- [-] 35.2 在不深改 Snow core 的前提下，为上述链路补最小运行时观测点或定向测试夹具，证明问题位于 `SSE/runtime seam` 而非工具执行层或 VCPToolBox；因 35.1 已证伪为环境问题，本项暂不推进 | depends_on: [35.1]
- [√] 35.3 在环境恢复后，已重新补跑 `local / bridge / hybrid` 多轮 live 黑盒并确认通过；`VCPChat/VCPToolBox` 候选增强项继续保留为独立 backlog，不与本轮阻断修复混做 | depends_on: [35.2]

### 36. 2026-04-01 SnowBridge 工具结果上下文折叠增强
- [√] 36.1 审计当前 `toolExecutor.ts` 的 `historyContent` 策略与 bridge tool payload 体积分布，区分“运输噪声剥离”与“真正的结果折叠”，并确认 `stash@{0}` 仅剩 `toolHistoryArtifacts.ts` 草稿；本轮已改为在 `v0.7.5` 合并后的工作树中人工吸收这条思路，不重放旧 stash | depends_on: [34.4, 35.3]
- [√] 36.2 在 execution seam 为 bridge/local 高膨胀工具补结构化历史摘要：新增 `source/utils/execution/toolHistoryArtifacts.ts`，当前已产出 `summary / status / asyncState / itemCount / topItems / truncated` 字段，并由 `toolExecutor.ts` 复用；`historyContent` 继续保留给 conversation context，`previewContent` 则留给 UI/display sidecar，避免 display schema 回灌模型上下文 | depends_on: [36.1]
- [√] 36.3 在 display / transcript seam 为工具结果补“摘要默认显示、详情按需展开”的折叠模型：`ToolResultPreview.tsx` 现可直接识别并渲染结构化 history summary JSON，且 `maxLines` 预算已补硬上限；`npx ava source/utils/execution/toolExecutor.test.ts source/hooks/conversation/core/toolResultHistory.test.ts source/hooks/conversation/core/toolResultDisplay.test.ts source/utils/session/sessionConverter.test.ts source/utils/session/toolResultView.test.ts` = `26 passed`，`npm run build:ts -- --pretty false` 通过；当前收口仍停留在 execution/display seam | depends_on: [36.2]
- [√] 36.4 在 `SnowBridge` 桥接层实现最小预摘要 sidecar：当前已在 `VCPToolBox/Plugin/SnowBridge/index.js` 的同步/异步结果发包前，为 `FileOperator`、`UrlFetch`、`LightMemo`、`VSearch` 生成 additive `historyContent/previewContent`，且 `snow-cli` execution seam 已优先消费该 sidecar；`PluginManager` 主链与 `snow-cli` core 均未被打穿 | depends_on: [36.2]
- [√] 36.5 补定向回归与 live 黑盒抽样，确认摘要折叠后 `bridge/hybrid` 不丢关键完成语义、不破坏 tool result 展示；当前 fresh live 黑盒已通过，唯一 `--keep-temp` 失败样本也已证伪为模型绕过工具指令的假失败。与 `VCPChat` 折叠思路的后续对照继续保留在 `37.x` 借鉴项，不再阻塞本项收口 | depends_on: [36.3, 36.4]

### 37. 2026-04-01 VCP 功能借鉴项（待重叠审计后决定是否纳入）
- [√] 37.1 审计并收口 `SnowBridge` 异步状态流接线：`bridgeClient.ts` 已把 `vcp_tool_status` 归一化为结构化 `BridgeStatusEvent`，`executeTool()` 会保留 `statusEvents` 并通过 `onStatus` 向 `toolExecutor.ts` 透出；`toolCallRoundHandler.ts` 已把状态接到 pending UI 的原位更新，但仍只停留在 `executor/display seam` | depends_on: [34.4]
- [√] 37.2 审计 bridge 多模态结果规范化：当前已在 `executor/display seam` 完成 `image_url -> Snow` 的最小兼容；raw bridge/tool result 继续保留，`historyContent/previewContent` 只记录净化后的 `[N image URL item omitted]` 摘要，并已补齐 `toolExecutor / toolResultDisplay / sessionConverter` 回归测试，不改 Snow core/provider | depends_on: [34.4]
- [√] 37.3 审计并收口 manifest 按客户端 `toolFilters` 缩面导出：`toolPlaneFacade.ts` 现会在 hybrid 模式前推 `excludeExactToolNames`，`SnowBridge/index.js` 也已扩展 `toolFilters` 协议并切到命令级过滤；当前缩面职责已前移到 `router seam + SnowBridge`，不再只是全量 manifest 后本地裁决 | depends_on: [31.4, 34.4]
- [√] 37.4 审计并收口旧式 description 的强 schema 约束提取：`bridgeManifestTranslator.ts` 现已保守提取固定值与受限选项为 `const/enum`，并通过 translator 回归测试锁定“稳定 literal 才提升、与 default 冲突则放弃”的边界 | depends_on: [33.2]
- [√] 37.5 审计并收口“聊天正文 vs sideband display”双通道分流：`toolResultDisplay.ts` / `MessageRenderer.tsx` / `MessageList.tsx` 已改为正文空 `content` + `toolStatusDetail` sideband + raw `toolResult/toolResultPreview` 分离，工具状态标题不再继续塞进聊天正文 | depends_on: [32.3]
- [√] 37.6 审计并收口流式消息生命周期状态机：`toolLifecycleSideband.ts` 已补最小 bridge 生命周期推进规则，`toolCallRoundHandler.ts` 会按 `toolCallId` 原位替换 pending 行，`sessionConverter.ts` 也会在 replay 时跳过已有最终结果对应的旧 pending 行，保证显示与持久化一致性不再双份堆叠 | depends_on: [32.3]
- [ ] 37.7 审计本地 abort 与远端 interrupt 联动：评估是否为 `snow-cli` 的长流和 bridge/tool 链路补一套“本地取消 + 远端中断 + partial content finalize”语义；当前已改判为深度魔改分支候选，不继续塞进当前过渡基线；候选来源 `VCPChat/Groupmodules/groupchat.js` | depends_on: [34.4]
- [√] 37.8 审计轻量 session metadata projection：当前已把 `mtime / size / messageCount` 收束为 `sessionManager.ts` 的 session-list metadata projection，`SessionListPanel.tsx` 已最小消费 `size` 展示，`sessionManager.test.ts` 也已补齐；本项仍只落在 `session sidecar / UI` 观察层，不进入 prompt / translator | depends_on: [32.3]
- [ ] 37.9 审计回合结束后的异步标题归纳：评估是否为 `snow-cli` 会话侧车层补 session/topic title rollup，改善长会话管理，而不让其侵入主聊天链；当前已改判为深度魔改分支或独立 UX 分支候选，暂不进入当前过渡基线；候选来源 `VCPChat/renderer.js`、`Groupmodules/topicTitleManager.js` | depends_on: [32.3]
- [√] 37.10 审计 router / tool-plane capability snapshot + reasonCode sidecar：当前已在 `toolRouteArbiter.ts -> toolPlaneFacade.ts -> useConversation/useStreamingState -> StatusLine.tsx` 补齐 runtime capability snapshot + `reasonCode` sidecar，状态栏现优先显示运行时实际有效工具面；同次还已修复 reviewer 指出的 two blocking issues（`conversationSetup` 对 router 类型的直接依赖、`toolPlaneRuntimeState` 的 stale 清理缺口），并以 seam test + fresh 黑盒重新验证无主链污染 | depends_on: [37.3, 32.3]

### 40. 2026-04-04 非深度借鉴项补录（VCPToolBox / VCPChat / VCP 哲学）
- [√] 40.1 以真实代码而不是 README/文档描述复核 `VCPToolBox`：当前已确认还能进入五层过渡基线的非深度借鉴点主要集中在 `bridge/router/execution seam`，包括 `Tool Profile` 缩面、bridge approval hint、基于插件热重载 watcher 推导的 `manifest revision/reloadedAt` sidecar、bridge capability/version metadata、执行前参数归一化与 accepted/final callback ingress；同时已明确 `占位符总线 / 预处理器中枢 / 完整 interrupt` 等仍属深度分支候选，不纳入本轮 | depends_on: [37.10]
- [√] 40.2 以真实消息链和 renderer 实现复核 `VCPChat`：当前已确认还能进入五层过渡基线的非深度借鉴点主要集中在 `session / display / chat seam`，包括会话全文检索入口、渐进式历史回放与列表渲染、富文本/旧上下文净化侧车、发送前投影雏形与长文本输入降压为附件 sidecar；同时已明确浏览器级富渲染、smooth streaming 引擎本体与大块 UI 基础设施不纳入当前过渡包 | depends_on: [37.10]
- [√] 40.3 将 `VCP` 设计哲学压成工程事实映射：当前已固定“预算化工具面、被动增强优先、异步状态旁路化、事实与投影分层、观察层 sidecar 优先”这 5 条可下放到过渡基线的原则；`context budget manager` 内化、tool plane 一等公民化、All 记忆/内容块系统等则继续明确排除到深度魔改分支 | depends_on: [40.1, 40.2]
- [√] 40.4 基于 `VCPToolBox/AdminPanel/tool_list_editor.js`、`VCPToolBox/routes/adminPanelRoutes.js` 与 `SnowBridge toolFilters` 设计 `Tool Profile` 缩面：允许 `snow-cli` 在不同 profile / mode 下按配置文件切换桥接工具子集，继续只落在 `router + tool-plane + SnowBridge`，不把全量工具导入 prompt | depends_on: [40.1]
  - 2026-04-04 已完成真实落地：`VCPToolBox/routes/admin/toolListEditor.js` 与 `AdminPanel/tool_list_editor.js` 统一改为保存/消费 `selectedExactToolNames + toolDescriptions[exactToolName]`，修掉旧 editor 只按 `tool.name` 选中与描述映射导致的跨插件重名碰撞。
  - `SnowBridge` 侧仅在 `Plugin/SnowBridge/index.js` 扩展 `toolFilters.profileName` → `ToolConfigs/<profile>.json` 解析，并把 profile 选择收敛为 `includeExactToolNames`/旧配置 `selectedTools` 的兼容 include；未触碰 `VCPToolBox/server.js` 与 `VCPToolBox/modules/chatCompletionHandler.js`。
  - `snow-cli` 侧仅在 `apiConfig/configScreen + toolPlaneFacade + bridgeClient` 增补 `bridgeToolProfile` 配置入口，并由 `prepareToolPlane()` 在 bridge manifest 请求时下发 `toolFilters.profileName`；provider/core 未扩散 profile 语义。
  - 已验证：`npx ava --timeout=1m "source/utils/session/vcpCompatibility/bridgeClient.test.ts" "source/utils/session/vcpCompatibility/toolPlaneFacade.test.ts" "source/ui/pages/configScreen/configDraft.test.ts" "source/ui/pages/configScreen/types.test.ts"`、`npm run build:ts -- --pretty false`、`node --check VCPToolBox/routes/admin/toolListEditor.js`、`node --check VCPToolBox/Plugin/SnowBridge/index.js`、`node --check VCPToolBox/Plugin/SnowBridge/sidecar-selftest.js`、`node VCPToolBox/Plugin/SnowBridge/sidecar-selftest.js` 全部通过。
- [√] 40.5 为 bridge 工具补 `approval hint` 与 `manifest revision` sidecar：优先尝试把现有 `approvalList/timeoutMinutes` 与插件热重载 watcher 提升为 `requiresApproval/approvalTimeoutMs/manifestRevision/reloadedAt` 这类只读元数据，让 `snow-cli` 复用现有确认 UI 与 snapshot 失效链，而不是在 core 重新设计审批或热重载语义 | depends_on: [40.1]
  - 2026-04-04 已完成真实落地，变更范围保持在 `VCPToolBox/Plugin.js`、`VCPToolBox/modules/toolApprovalManager.js`、`VCPToolBox/Plugin/SnowBridge/index.js` 与 `snow-cli/source/utils/session/vcpCompatibility/*`；未修改 `VCPToolBox/server.js` 与 `VCPToolBox/modules/chatCompletionHandler.js`。
  - 已验证：`npx ava --timeout=1m "source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts" "source/utils/session/vcpCompatibility/toolSnapshot.test.ts" "source/utils/session/vcpCompatibility/bridgeClient.test.ts"`、`npm run build:ts -- --pretty false`、`node --check VCPToolBox/Plugin.js`、`node --check VCPToolBox/modules/toolApprovalManager.js`、`node --check VCPToolBox/Plugin/SnowBridge/index.js`、`node VCPToolBox/Plugin/SnowBridge/sidecar-selftest.js` 全部通过。
- [√] 40.6 为 bridge/export seam 补最小执行前参数归一化与 accepted/final callback ingress：优先吸收 `file://` 透明解引用、accepted -> final result 两段式与 `plugin_async_callback` ingress 思路，但禁止把旧 `plugin_async_callback` 未闭环事件名或旧 `VCPToolBridge` 早期实现再带回当前基线 | depends_on: [40.1]
  - 2026-04-04 已完成真实落地：`snow-cli` 侧仅在 `bridgeManifestTranslator.ts`、`toolExecutionBinding.ts`、`toolExecutor.ts`、`toolCallRoundHandler.ts` 增补 alias / `file://` / accepted-final ingress 归一化；未把 VCP 私有语义灌回 provider 或模型层。
  - `VCPToolBox` 侧仅落在 `Plugin.js` 与 `Plugin/SnowBridge/*`：执行前参数兼容、`plugin_async_callback` 闭环、`VCPAsyncResults` watcher；`shutdownAllPlugins()` 已接入 `stopAsyncResultIngressWatcher()`，生命周期未遗漏。
  - 主窗口复核补充：已移除 `SnowBridge.handleExecuteTool()` 对 `preprocessToolArgs()` 的重复调用，避免 bridge 路径双重 `file://` 预处理；同时补了 final error ingress 与 async callback error 自测，防止只有 success 路径被验证。
  - 已验证：`npx ava --timeout=1m "source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts" "source/utils/session/vcpCompatibility/toolExecutionBinding.test.ts" "source/utils/execution/toolExecutor.test.ts" "source/hooks/conversation/core/toolCallRoundHandler.test.ts"`、`npm run build:ts -- --pretty false`、`node --check VCPToolBox/Plugin.js`、`node --check VCPToolBox/Plugin/SnowBridge/index.js`、`node --check VCPToolBox/Plugin/SnowBridge/bridgeCompat.js`、`node --check VCPToolBox/Plugin/SnowBridge/sidecar-selftest.js`、`node VCPToolBox/Plugin/SnowBridge/sidecar-selftest.js` 全部通过。
  - 测试口径说明：`toolCallRoundHandler.test.ts` 冷启动导入链较重，默认 ava 超时下会误报；当前固定为 `--timeout=1m`，避免把测试夹具噪声误判成运行时回归。
  - 审计备注：当前缺的只是补强型用例，不是阻断问题；优先补 `final error` / callback 失败分支 / bridge exact-tool alias 去重类回归测试，随后再进入 40.4 黑盒前复核。
- [√] 40.7 为 `session` 层补会话全文检索入口：参考 `VCPChat topicListManager + ipc chatHandlers` 的“两段式检索”，先做标题/日期快筛，再按持久化消息正文补一轮 `content match`，但仍保持只读会话侧车实现，不进入 provider/tool-plane 主链 | depends_on: [40.2]
  - 2026-04-04 已完成真实落地：`snow-cli/source/utils/session/sessionManager.ts` 增补 `matchesSessionQuickSearch()` / `matchesSessionContentSearch()` 与 `listSessionsPaginated()` 两段式搜索；先用 `title/summary/id/createdAt/updatedAt` 快筛，再按持久化 `messages.content/historyContent/previewContent` 做正文补筛，未把索引或 snippet 回写会话文件。
  - 已验证：`npx ava --timeout=1m "source/utils/session/sessionManager.test.ts"` 与并行回归集通过；`npm run build:ts -- --pretty false` 通过。
- [√] 40.8 为 `display` 层补渐进式历史回放与列表渲染：优先借用“先显示最近消息，再用 `requestIdleCallback/requestAnimationFrame` 批量补老消息”的思路，为长会话历史和列表渲染降压，但不移植浏览器富渲染框架本体 | depends_on: [40.2]
  - 2026-04-04 已完成真实落地：新增 `snow-cli/source/ui/pages/chatScreen/useProgressiveHistoryReplay.ts`，在长会话下先显示最近消息，再用 `setTimeout` 分批补老消息；`ChatScreenConversationView.tsx` 仅消费 `visibleMessages`，未把调度塞进 `sessionConverter.ts`，也未引入浏览器专属 `requestIdleCallback/rAF`。
  - 已验证：`npx ava --timeout=1m "source/ui/pages/chatScreen/useProgressiveHistoryReplay.test.ts"` 与并行回归集通过；`npm run build:ts -- --pretty false` 通过。
- [√] 40.9 为 `chat seam / outbound seam` 补统一净化链与发送前轻量投影：参考 `contextSanitizer.js`、`groupchat.js` 与 `RAGDiaryPlugin` 的做法，只处理较旧 assistant/tool 内容、保留最近 N 条原样，并在写回模型上下文前统一净化 HTML/系统提示壳/旧协议标记；同时把复杂 UI 原文压成稳定文本投影，长文本输入优先转为附件/临时文件 sidecar，而不是继续把大块原文直接塞进当前轮 prompt | depends_on: [40.2, 40.3]
  - 2026-04-04 已完成真实落地：`snow-cli/source/utils/session/vcpCompatibility/outboundProjectionBridge.ts` 与 `applyOutboundMessageTransforms.ts` 新增统一 outbound transform，只在 `backendMode=vcp + requestMethod=chat` 生效，对较旧 assistant/tool 消息做 HTML / 旧协议壳 / ANSI 清洗与稳定文本投影，同时保留最近 6 条 assistant/tool 消息原样，未深改 provider/core。
  - 已验证：`npx ava --timeout=1m "source/utils/session/vcpCompatibility/outboundProjectionBridge.test.ts"` 与并行回归集通过；`npm run build:ts -- --pretty false` 通过。
- [√] 40.10 为 `session/tool history seam` 与桥侧 recall helper 补去重补偿与预算门禁：参考 `RAGDiaryPlugin` 的 `context duplicate filter + dedupBuffer`、`aggregateMinK + softmax` 与 rerank token budget/circuit breaker，只在 `history projection / bridge helper` 层实现“去重后补偿、长文档截断、过载时旁路退化”，不把 TagMemo/TimeDecay/AIMemo 主策略带入当前过渡基线 | depends_on: [40.3]
  - 2026-04-04 已完成真实落地：`snow-cli/source/utils/session/toolMessageProjection.ts` 新增 generic tool history normalize / dedupe / budget gate，`projectToolMessagesForContext()` 会对 tool 消息做统一压缩、重复摘要折叠与总预算门禁；`sessionInitializer.ts`、`useCommandHandler.ts`、`subAgentStreamProcessor.ts`、`teamExecutor.ts` 已改为消费统一投影链，未把更重的 recall 主策略搬进 Snow Core。
  - 已验证：`npx ava --timeout=1m "source/hooks/conversation/core/toolResultHistory.test.ts"` 与并行回归集通过；`npm run build:ts -- --pretty false` 通过。
  - 2026-04-04 二次复审补修：`useProgressiveHistoryReplay.ts` 已把 options 归一并 `useMemo()`，避免父组件重渲染时持续重置历史回放 timer；`useProgressiveHistoryReplay.test.ts` 已补 rerender regression。`types.ts + useConfigState.ts` 已把 bridge 凭据字段收敛到 `BRIDGE_CREDENTIAL_FIELDS`，`bridgeToolProfile` 现已纳入隐藏字段焦点回退与 create/save profile 的统一 draft 构建，不再遗漏。`sessionManager.ts` 的全文检索补筛已改为 `Promise.all` 并发读盘，同时保持 quick-hit 在前的结果顺序；对应 `ava` 定向回归与 `npm run build:ts -- --pretty false` 已再次通过。
  - 2026-04-04 fresh 黑盒复核：`npm run test:vcp:blackbox -- --config scripts/fixtures/vcp-blackbox.local-bridge.json --modes local,bridge,hybrid` 通过；`npm run test:vcp:blackbox -- --suite subagent --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode local` 通过；`npm run test:vcp:blackbox -- --suite team --config scripts/fixtures/vcp-blackbox.local-bridge.json --mode local --keep-temp` fresh rerun 通过。首个 `team` 样本曾出现一次 “expected 6 got 7” 的 harness 级假失败，但未复现；同批 `VCPToolBox/DebugLog/archive/2026-04-04/Debug` 抽样未再看到 `filesystem-readfilesystem-read`、`Unexpected end of JSON input`、`</think>` 或旧协议泄漏。
  - 审计留痕：当前仍无 `ChatScreenConversationView` 的完整组件级接线测试，`toolMessageProjection` 各调用点也仍主要依赖 runtime 黑盒覆盖；现阶段已由 fresh `local/bridge/hybrid + subagent/team` 黑盒兜底，记为非阻断 warning，不再继续深改 Snow Core / VCPToolBox Core。
  - 2026-04-04 主窗口复核：当前未发现 `40.4~40.10` 直接越过五层边界的真实代码问题；`VCPToolBox/server.js` 与 `VCPToolBox/modules/chatCompletionHandler.js` 未进入 diff。现阶段仅保留两条非阻断测试口径告警：`ChatScreenConversationView.tsx` 接了 `useProgressiveHistoryReplay()`，但仍缺真实组件级接线测试；`projectToolMessagesForContext()` 已接到 `sessionInitializer/useCommandHandler/subAgent/team`，但还缺 caller-level 语义回归，暂交给后续 live 黑盒继续兜底。

### 42. 2026-04-04 Borrowing backlog (VCPToolBox / VCPChat)
- [√] 42.1 Review SnowBridge source contract and ingress hardening: the code already enforces Snow provenance / optional token / rate limit inside `Plugin/SnowBridge`, while `snow-cli` only emits `x-snow-*` headers plus optional `accessToken`; this stays a valid transition-baseline candidate only as a read-only diagnostics sidecar, with enforcement continuing to live in `SnowBridge` rather than `Snow Core` | depends_on: [40.1, 40.5]
  - Evidence: `VCPToolBox/Plugin/SnowBridge/index.js:1028-1052,1112-1147,1192-1305,1722-1728,1848-1849,1953-1960`, `VCPToolBox/Plugin/SnowBridge/config.env.example:24-42`, `VCPToolBox/Plugin/SnowBridge/plugin-manifest.json:37-55`, `snow-cli/source/utils/session/vcpCompatibility/bridgeClient.ts:247-258,703-714`.
  - 2026-04-05 main-window review: the hardening code is real, but the current `config.env` does not explicitly set `Allowed_Snow_Tool_Modes` / `Require_Snow_Request_Headers`, so do not overstate this as "all gates fully enabled in runtime config". Keep provenance/mode visibility as UI diagnostics only; do not re-implement token/mode/rate-limit policy in Snow execution/core seams.
- [√] 42.2 Review bridge health probe and sidecar self-test: `SnowBridge` already has three real pieces - plugin HTTP `/status`, tool command `GetStatus`, and `sidecar-selftest.js` - but they are not a single unified diagnostics channel yet; for the transition baseline, prefer `/api/plugins/SnowBridge/status` plus `sidecar-selftest.js` as out-of-band health/ops diagnostics and avoid pushing health state back into manifest/tool payloads | depends_on: [42.1]
  - Evidence: `VCPToolBox/Plugin/SnowBridge/index.js:960-967,2013-2021`, `VCPToolBox/Plugin/SnowBridge/plugin-manifest.json:15,58-65`, `VCPToolBox/Plugin.js:1481-1487`, `VCPToolBox/server.js:539-565`, `VCPToolBox/Plugin/SnowBridge/sidecar-selftest.js:1-285`, `snow-cli/source/utils/session/vcpCompatibility/toolPlaneFacade.ts:96-127`, `snow-cli/source/utils/session/vcpCompatibility/bridgeManifestTranslator.ts:22-27,161-193`.
  - 2026-04-05 main-window review: `GetStatus` currently returns raw `config`, so it should not become the main model-visible health path. Keep health/self-test in UI sidecar / blackbox / ops diagnostics, and do not modify `VCPToolBox/server.js` or `VCPToolBox/modules/chatCompletionHandler.js` for this item.
- [√] 42.3 Review stable approval target matching: current `PluginManager` / `ToolApprovalManager` only partially support stable approval identity - `exactToolName` and `commandIdentifier` are already present, but matching still accepts `displayName` / `toolName` / `pluginName`; keep the borrowing as a principle-level candidate (`approval binds to stable tool identity, never display name`) rather than claiming the current VCP implementation is already strict | depends_on: [40.5]
  - Evidence: `VCPToolBox/modules/toolApprovalManager.js:15-23,117-176`, `VCPToolBox/Plugin.js:21-45,923-968,1068-1088`, `VCPToolBox/Plugin/SnowBridge/index.js:1505-1528,1621-1643`, `snow-cli/source/utils/session/vcpCompatibility/bridgeManifestTranslator.ts:1113-1184`, `snow-cli/source/utils/session/vcpCompatibility/toolRouteArbiter.ts:84-125`.
  - 2026-04-05 main-window review: the current VCP side is still a loose multi-candidate matcher, not a strict `exactToolName-only` approval model. If this principle is adopted into the transition baseline, the canonical identity should live in bridge/tool-plane export metadata while `snow-cli` only consumes it; do not push approval matching into Snow Core, and do not modify `VCPToolBox/server.js` or `VCPToolBox/modules/chatCompletionHandler.js`.
- [√] 42.4 Review message-level global search enhancements: `VCPChat` does have a real message-level global search stack (cross-topic aggregation, pagination, navigate-to-message, and safer result rendering), but only the read-side search/projection ideas fit the transition baseline; the actual DOM/CSS implementation should not be copied into `snow-cli`'s Ink/TUI runtime | depends_on: [40.7, 40.8]
  - Evidence: `VCPChat/modules/searchManager.js:182-201,203-240,241-326,336-539`, `VCPChat/styles/search.css:168-223`, `snow-cli/source/utils/session/sessionManager.ts:130-160,749-810`, `snow-cli/source/ui/components/panels/SessionListPanel.tsx:22-55,71-90`, `snow-cli/source/ui/pages/chatScreen/useProgressiveHistoryReplay.ts:75-149`.
  - 2026-04-05 main-window review: cross-topic aggregation / pagination / navigate already existed in older VCPChat variants, while the stronger borrowing value today is code-block-safe snippet rendering and DOM-safe highlighting as a design pattern. Keep any future implementation in `session + display + UI sidecar` only; do not alter provider flow, session persistence format, or VCPToolBox core files for this item.
  - [√] 42.5 Review incremental sync sidecar for externally modified history files: `VCPChat` already has a session/display-side delta sync path via `onHistoryFileUpdated()` -> `syncHistoryFromFile()`, so this remains a valid transition-baseline borrowing candidate as long as it stays in `session/display seam` and does not expand into a full history diff engine | depends_on: [40.7, 40.8]

### 43. 2026-04-05 20.x-41.x 历史修复回溯审计
- [√] 43.1 使用多子代理 + 主窗口交叉复核活跃方案包 `20.x-41.x`：当前确认 `20.x / 21.x / 23.x / 30.x-37.x / 40.x-41.x` 主体仍大体可信，但不能继续把“历史已修”一概视为高置信铁证；涉及黑盒通过的旧表述需结合当时夹具口径理解 | depends_on: [41.6]
  - 当前最硬的代码/方案包冲突点有两处：其一，`22.3` 写成“`VCPToolBox/modules/roleDivider.js` 已复用 `ToolCallParser.MARKERS`”，但真实代码 `VCPToolBox/modules/roleDivider.js:81-84` 仍手写 `<<<[TOOL_REQUEST]>>> / <<<[END_TOOL_REQUEST]>>>`，而 `ToolCallParser.MARKERS` 实际定义在 `VCPToolBox/modules/vcpLoop/toolCallParser.js:3-6`；其二，`38.2` 写成“`timeContextBridge.ts` 已按真实 VCP 运行时请求语义判门，不再依赖原始 `config.requestMethod`”，但真实代码 `snow-cli/source/utils/session/vcpCompatibility/timeContextBridge.ts:259-260` 与测试 `timeContextBridge.test.ts:167-188` 仍锁定 `requestMethod === 'chat'` 旧语义。
  - 当前最可疑的“结论先于证据”主线仍是 `26.2/26.3 + 29.1/29.2/29.5` 这一条 `chat.ts` 流式 tool-call 聚合链：当时 helper 级测试只覆盖理想化 `missing-index + stable-id + same-tool-name` 场景，未覆盖 `filesystem-readterminal-execute / terminal-executefilesystem-read / arguments:\"{}\"` 这类 live 坏流；该问题已在 2026-04-05 的 fresh live 取证与后续薄修中被再次坐实并纠偏。
  - `22.2` 虽然当时功能上可能成立，但从当前已经固定的五层边界看属于历史越界债：它显式修改了 `VCPToolBox/modules/chatCompletionHandler.js`，与后续长期原则“核心尽量不改、只动 SnowBridge/`snow-cli` seam”冲突；现阶段更适合作为后续收束或回滚评估对象，而不是继续被描述成无风险收口。
  - 其余主要提醒：`21.5 / 24.4` 的“fresh runtime / 全面黑盒全部通过”现在应降级理解为“在当时那版夹具下通过”，因为后续黑盒脚本对 session 落盘时序、prompt 口径与最终文本判定做过多次收紧；`24.1` 的“当前验证分支”已文档漂移（方案包仍写 `verify/20260331-origin-main-merge-followup`，实际工作树为 `verify/20260330-official-main-merge`）；方案包内部仍存在重复条目 `25.2`、`28.1`、`30.4`，属于文档卫生债，会放大审计漂移。
  - 当前更稳的桶：`30.x-34.x` 未发现像 `22.3` / `38.2` 这样的硬冲突；`34.x` 虽有 `toolExecutor + toolMessageProjection + subAgent/team` 多点联动的维护债，但目前还没坐实成错误实现。`35.x-37.x` 现阶段也未发现必须推翻的代码-方案包反向冲突；`40.4-40.10` 继续维持“边界内落地，仍缺少少量 caller/component 级测试”的非阻断 warning 级结论。
  - Evidence: `VCPChat/renderer.js:1104-1110`, `VCPChat/modules/chatManager.js:1519-1608`, `VCPChat/modules/chatManager.js:427-431`.
  - 2026-04-04 main-window review: current sync covers add/delete/content-modify and protects editing + active streaming messages, but still compares only `content` and may leave DOM order slightly stale after additions; keep wording conservative and do not overstate it as a general-purpose merge engine.
- [√] 42.6 Review minimal intent replay when renderer/UI is not ready: `VCPChat` proves a tiny `{itemId, itemType, topicId}` replay token is enough for renderer-not-ready recovery, so this remains a clean transition-baseline candidate as a startup/UI readiness sidecar rather than a large session snapshot cache | depends_on: [42.5]
  - Evidence: `VCPChat/modules/topicListManager.js:270-279`, `VCPChat/renderer.js:1058-1075`, `VCPChat/modules/chatManager.js:352-391`.
  - 2026-04-04 main-window review: this is strictly a renderer-ready replay aid, not cross-restart persistence and not a heavy recovery framework; keep it in `session/display seam` only.
- [√] 42.7 Review model usage / favorites sidecar: `VCPChat` does have a local usage/favorites sidecar, but the real code is only half wired and its Electron IPC shape should not be copied into `snow-cli`; keep only the lighter idea of `ModelsPanel` favorites / local ordering as an optional UI/config candidate | depends_on: [40.2]
  - Evidence: `VCPChat/modules/modelUsageTracker.js:1-164`, `VCPChat/modules/settingsManager.js:972-977,1016-1125`, `VCPChat/main.js:714-743`, `VCPChat/preload.js:125-129`, `snow-cli/source/utils/core/usageLogger.ts:45-143`, `snow-cli/source/ui/components/panels/UsagePanel.tsx:151-251`.
  - 2026-04-04 main-window review: do not migrate the tracker itself. `snow-cli` already has usage logging + `UsagePanel`; if borrowed at all, constrain it to pure `UI/config/session-display` ordering metadata and keep it out of provider/model/core protocol seams.
- [√] 42.8 Review collapsible tool/thought result panels: `VCPChat` confirms the UI value of collapsible tool/thought panels, but its implementation depends on legacy text-protocol parsing inside message bodies; for `snow-cli`, only the display shell is worth borrowing, rebuilt on top of existing structured sideband fields instead of reviving protocol parsing | depends_on: [37.5, 36.3]
  - Evidence: `VCPChat/modules/messageRenderer.js:319-433,561-599,1125-1140`, `VCPChat/styles/messageRenderer.css:1045-1078,1355-1413`, `snow-cli/source/ui/components/chat/MessageRenderer.tsx:94-105,145-205,579-591`, `snow-cli/source/ui/components/tools/ToolResultPreview.tsx:130-180`.
  - 2026-04-04 main-window review: keep only the `structured sideband collapsible panel` idea. Do not extend `snow-cli`'s legacy VCP body parser path for this work, and do not feed panel content back into `message.content` or model context.
- [ ] 42.9 Review "branch from selected message" session flow: based on `VCPChat/modules/chatManager.js` and `modules/renderer/messageContextMenu.js`, decide whether `snow-cli` should support `fork new session branch from one message` as a deep UX / v2 candidate; explicitly keep it out of default worktree or execution-flow assumptions for the current transition baseline | depends_on: [42.4]
  - Evidence: `VCPChat/modules/chatManager.js:1355-1444`, `VCPChat/modules/renderer/messageContextMenu.js:249-259`.
- [ ] 42.10 Review richer composer / resident runtime deep candidates: first, whether v2 should borrow `inputEnhancer` features such as `@note` suggestions, shared file injection and long-text-to-attachment conversion; second, whether `Plugin.js` `isReloading + reloadTimeout + resident-plugin exemption` should become a bridge admin / runtime tiering strategy. Keep both as deep candidates, not current transition-baseline work | depends_on: [40.5, 40.9]
  - Evidence: `VCPChat/modules/inputEnhancer.js:191-199,207-244,246-320,456-469`, `VCPToolBox/Plugin.js:1641-1713`.

### 43. 2026-04-05 ????????42.3 + 42.8?
- [?] 43.1 ?? bridge approval identity ??????????? `exactToolName / commandIdentifier / commandName` ? canonical approval target??? `displayName/publicName` ???????????????? `toolApprovalConfig.json` ?????????? | depends_on: [42.3]
  - 2026-04-05 ??? `VCPToolBox/modules/toolApprovalManager.js` ? `Plugin.js` ???????????? `displayName/publicName` ?????`PluginManager._buildToolApprovalDescriptor()` ????? identity ??? alias??????? `exactToolName`?`commandIdentifier/commandName`?`plugin:command / plugin/command / plugin.command`?????????? `pluginName`?
  - 2026-04-05 ????????????? `VCPToolBox/server.js` ? `VCPToolBox/modules/chatCompletionHandler.js`?????????????? `snow-cli`?
- [?] 43.2 ???????? sidecar / selftest / translator ??????? `snow-cli` ???? bridge metadata???????????? Snow Core????? `VCPToolBox/server.js` / `modules/chatCompletionHandler.js` | depends_on: [43.1]
  - 2026-04-05 ?? `VCPToolBox/modules/toolApprovalManager.selftest.js` ? `Plugin/SnowBridge/sidecar-selftest.js`??? `displayName/publicName` ?????`exactToolName` ? `commandIdentifier` ?????bridge sidecar ??? canonical identity?
  - 2026-04-05 ????????`node VCPToolBox/modules/toolApprovalManager.selftest.js`?`node VCPToolBox/Plugin/SnowBridge/sidecar-selftest.js`?`node --check VCPToolBox/Plugin.js`?`node --check VCPToolBox/modules/toolApprovalManager.js`?`node --check VCPToolBox/Plugin/SnowBridge/index.js` ?????`snow-cli` ??????? `requiresApproval/approvalTimeoutMs` ????`npx ava "source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts" "source/utils/session/vcpCompatibility/toolSnapshot.test.ts"` ?????
- [?] 43.3 ????? sideband ? tool/thinking ????????????? `thinking / toolResult / toolResultPreview / toolStatusDetail`????? legacy VCP body parser?????????? `message.content` / session persistence | depends_on: [42.8]
  - 2026-04-05 ?? `snow-cli/source/ui/components/chat/StructuredSidebandPanel.tsx`?`MessageRenderer.tsx`?`ChatScreen.tsx`?`ChatScreenConversationView.tsx` ? `useChatScreenModes.ts` ?????????????????? sideband ????? provider flow?tool routing?session persistence????? legacy VCP body parser?
  - 2026-04-05 UI ????? `useChatScreenInputHandler.ts`??? `Ctrl+T`?thinking panel?? `Ctrl+U`?tool panel???????????? chat-screen ?????
- [?] 43.4 ? `MessageRenderer / ToolResultPreview / chat screen modes` ???????? sideband ?????? `showThinking` ???????? local / bridge / hybrid ????? | depends_on: [43.3]
  - 2026-04-05 ??? `snow-cli/source/ui/components/chat/MessageRenderer.test.tsx`??? thinking sideband ??/???`showThinking=false` ?????tool sideband ??/????? `toolResultPreview` ??????
  - 2026-04-05 ????????`cd H:/github/VCP/snow-cli; npx ava "source/ui/components/chat/MessageRenderer.test.tsx" "source/ui/components/tools/ToolResultPreview.test.tsx"` = `4 passed`?
- [?] 43.5 ?? `build:ts` + ???? + ?? bridge/selftest ????? 42.3 / 42.8 ???????????? `LIVE_STATUS` / `.status.json`???????? review ???? | depends_on: [43.2, 43.4]
  - 2026-04-05 ???????????`cd H:/github/VCP/snow-cli; npm run build:ts -- --pretty false` ???`cd H:/github/VCP/snow-cli; npx ava "source/utils/session/vcpCompatibility/bridgeManifestTranslator.test.ts" "source/utils/session/vcpCompatibility/toolSnapshot.test.ts"` = `21 passed`?VCPToolBox ?? selftest ??? `node --check` ?????
  - 2026-04-05 ???? warning ???????tool approval ???????? `displayName/publicName` ????????????????????structured sideband ?????? chat-screen ?????????????????????? UI sidecar ????????????
