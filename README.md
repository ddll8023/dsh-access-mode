# dsh-access-mode

> 给 DeepSeek Harness（DSH）会话提供 Default / No Edit / Auto 三种访问模式，控制 AI 能自动执行什么、什么需要审批、使用哪种 Sandbox。

- 兼容版本：DSH `0.2.1-rc.2`
- License：MIT

## 功能特性

- 在 Web composer 左侧提供 **Default / No Edit / Auto** 三个访问模式下拉选择器。
- 替换原生 Permission Presets 选择器，不修改 Harness 核心代码、Agent loop、工具实现或模型调用流程。
- 模式按 Agent session 持久化，切换后 Sandbox 与 Approval 策略同步生效。
- 复用 Harness 原生 Approval、Sandbox、Tool Execution、Session 和 Remote Command 服务。

## 安装与启用

### 方式 A（推荐）：`dsh plugin`

```bash
# 直接从 GitHub 安装（推荐）
dsh plugin --profile web add github:ddll8023/dsh-access-mode

# 或先 clone 到本地，再安装本地路径
git clone https://github.com/ddll8023/dsh-access-mode.git
dsh plugin --profile web add /绝对路径/dsh-access-mode

# 已发布到 npm registry 后也可使用包名：
dsh plugin --profile web add dsh-access-mode
```

`dsh plugin` 需要 `pnpm`，可以通过 `corepack enable pnpm` 启用。安装后重启 `dsh web`，插件会随 `web` profile 启动。

### 方式 B：手动加入 profile

1. 将插件包放入 `$DSH_HOME/profiles/web/node_modules/dsh-access-mode`，或执行 `npm install /绝对路径/dsh-access-mode`。
2. 在 `$DSH_HOME/profiles/web/package.json` 的 `dsh.profile.bundles` 中追加 `"dsh-access-mode"`。
3. 重启 `dsh web`。

### 验证是否启用

```bash
dsh --profile web --dump-config | grep -A2 access-mode
```

预期能看到类似：

```yaml
- id: access-mode
  name: dsh-access-mode
```

重启并刷新 Web GUI 后，composer 左侧会出现 **Default**、**No Edit**、**Auto** 三个访问模式，新会话默认选中 **No Edit**。host 端代码的变更需要重启 `dsh web`；只有 client bundle 的变更可以在 client-watch 开启时通过 HMR 更新。

## 使用

### 访问模式

插件同时设置会话的工具访问门、原生 Approval 策略和原生 Sandbox 模式：

| 模式 | DSH Sandbox | Approval | 插件访问策略 |
| --- | --- | --- | --- |
| **Default** | `workspace-write` | `ask` | 只自动放行只读工具和保守的只读 Bash；编辑、写入、变更或未知操作需要审批 |
| **No Edit** | `danger-full-access` | `ask` | 只有 `edit` 和 `write` 需要审批；其它工具直接放行，Bash 参数不做检查 |
| **Auto** | `danger-full-access` | `never` | 放行所有工具调用 |

#### Default

自动放行的只读工具包括 `read`、`grep`、`glob`、`search`、`web_search`、`web_fetch`、`lsp`、`ask_user_question` 和 `skill`。Bash 只有在命令属于保守的只读集合、没有重定向/命令拼接/命令替换等写入风险时才自动放行。

其它工具调用进入原生 Approval。由于 Sandbox 是 `workspace-write`，获批的写入仍然只能作用于当前 session workspace 和允许的临时目录。

#### No Edit

新会话默认使用 **No Edit**。

`No Edit` 的含义是“编辑操作不自动执行”，不是“禁止编辑”。`edit` 和 `write` 会先经过原生 Approval；用户批准后，Sandbox 使用 `danger-full-access`，因此不会再因为目标文件位于 workspace 外而出现 `workspace-write` 边界错误。

Bash 在插件访问门上直接放行，且故意不读取 Bash 参数。仍然会经过原生工具执行链和会话生命周期控制。

#### Auto

Auto 同时关闭插件访问门和原生 Approval，并使用 `danger-full-access`。它适合完全信任当前会话的场景，不应对不可信的提示词、项目或远程内容启用。

### 切换模式

Web composer 中的下拉选择器会执行同一个 session-scoped 命令：

| 命令 | 说明 |
| --- | --- |
| `/access-mode` | 查询当前模式 |
| `/access-mode default` | 切换到 Default |
| `/access-mode no-edit` | 切换到 No Edit |
| `/access-mode auto` | 切换到 Auto |

模式写入当前 Agent session，不会影响其它会话。插件会持久化以下原生 session event：

- `permission/preset`：插件自己的三模式值
- `sandbox/mode`：`workspace-write` 或 `danger-full-access`
- `approval/policy`：由原生 Approval service 写入的 `ask` 或 `never`

原生 permission-preset 服务保留 `auto` 作为其可选 Auto-review integration 的固定身份，禁止同名配置预设，因此 **Auto** 模式的预设键存为 `danger-full-access`（与其 Sandbox 一致）；对外命令与标签仍是 `auto` / **Auto**。

因此文件系统、Bash 和其它受 Sandbox 保护的能力会在每次执行时读取同一个会话模式；切换模式或恢复历史会话后不会回到旧的 Sandbox 设置。

对于没有插件模式事件的旧 session，插件会根据已有 Approval 状态初始化：已有 `never` 状态视为 Auto，其它情况视为 No Edit，然后补齐对应的 Sandbox 和 Approval 状态。

## 安全说明

- 插件目标版本为 DeepSeek Harness `0.2.1-rc.2`。
- No Edit 和 Auto 会使用 `danger-full-access`，这是为了让自定义模式不再被原生 `workspace-write` 路径边界覆盖；请只对可信 session 使用这两个模式。
- Default 仍保留 `workspace-write` 边界。需要访问 workspace 外文件时，应明确切换到 No Edit 并批准编辑操作，或把目标文件放入当前 session workspace。
- `danger-full-access` 只取消 DSH 文件 Sandbox 的路径限制，不等于绕过操作系统权限、容器权限或远程执行环境本身的限制。
- 该插件不修改原生工具的取消、Sandbox provider、Session persistence 或执行后处理逻辑；如果宿主版本移除 `permission/preset` 或 `sandbox/mode` event vocabulary，需要同步更新插件的 session 适配层。

## 开发与测试

### 插件文件

```text
dsh-access-mode/
├── package.json              # 插件清单：bundle patch、Web client 声明、构建/测试脚本
├── cordis.patch.yml          # 禁用原生 permission/ui-permission，插入本插件 host entry
├── lib/
│   ├── index.js              # host 入口：模式投影、命令、Approval/Sandbox 同步、工具策略
│   └── client.js             # Web 入口：原生风格的 composer 下拉选择器
├── src/
│   └── client-body.js        # client.js 的源文件
├── scripts/
│   └── build-client.mjs      # 生成 lazy-CJS Web bundle
└── test/
    └── policy.test.js        # 模式折叠、Sandbox 映射、工具策略与 Bash 分类测试
```

### 实现说明

#### Bundle patch

`cordis.patch.yml` 只做以下替换：

```yaml
- id: permission
  disabled: true

- id: ui-permission
  disabled: true

- insert:
    - id: access-mode
      name: dsh-access-mode
```

原生的 Approval、Sandbox、Tools 和 Session service 仍然存在。插件通过原生 session 事件切换 Sandbox，通过 `ctx.approval.setPolicy()` 切换 Approval，并通过 `tools/pre-execute` 实现三种访问门。

#### Web UI

`src/client-body.js` 使用 Harness 共享的 `@deepseek-ai/dsh-client-ui-primitives`：

- 使用原生 `Menu` 渲染选项列表和当前选中标记；
- 使用原生风格的 28px pill trigger、hover/focus 状态和 chevron；
- 不使用浏览器默认 `<select>`，避免操作系统下拉框与 Harness UI 不一致。

`lib/client.js` 是 Web runtime 需要的 lazy-CJS 格式，由以下命令生成：

```bash
npm run build
```

### 运行测试

```bash
cd dsh-access-mode
npm run build
npm test
npm pack --dry-run
```

当前测试覆盖：

- `permission/preset` 的最新模式读取；
- 三种模式到 Sandbox 的映射；
- `Default`、`No Edit`、`Auto` 的工具访问决策；
- No Edit 不读取 Bash 参数；
- 只读 Bash 分类以及写入/命令拼接拦截。
