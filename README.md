# Yunzai 插件仓库管理

适用于 Yunzai V3，接入 [guoba-plugin-next](https://github.com/cchanlan/guoba-plugin-next)。提供仓库地址切换、GitHub / Gitee / GitCode 凭据配置，以及独立的 JS 插件管理页面。

无额外 npm 依赖。

## 目录

- [功能与入口](#功能与入口)
- [安装与升级](#安装与升级)
- [仓库插件管理](#仓库插件管理)
- [JS 插件管理](#js-插件管理)
- [配置与备份](#配置与备份)
- [常见问题](#常见问题)
- [测试](#测试)

## 功能与入口

| 功能 | 锅巴入口 | 管理范围 |
| --- | --- | --- |
| 仓库插件管理 | 插件配置 → Yunzai 插件仓库管理 | `plugins/`、`user_plugins/` 下带 `.git` 和 `origin` 的一级插件目录，本插件自身除外 |
| JS 插件管理 | 扩展页面 → JS 插件管理 | **仅 `plugins/example/` 第一层的普通 `.js` 和 `.js.disabled` 文件** |

仓库管理支持 GitHub、Gitee、GitCode 和自定义 HTTPS / SSH 地址。切换操作修改 Git 的 `origin`，不会自动克隆、拉取或更新插件代码。

JS 管理支持上传、新建、源码编辑、文件名搜索、状态筛选、启用、停用、回收站和备份恢复。

## 安装与升级

### 首次安装

1. 确认 Yunzai 已安装 `guoba-plugin-next`，仓库管理功能需要系统可使用 Git。
2. 解压安装包，将 `yunzai-repo-manager` 文件夹放入 Yunzai 的 `plugins/` 目录。
3. 重启 Yunzai，登录锅巴后按上表进入对应页面。

也可以在 Yunzai 根目录执行以下命令安装，然后重启：

```bash
git clone https://github.com/yuxiri/yunzai-repo-manager.git ./plugins/yunzai-repo-manager
```

安装后的目录位置：

```text
Yunzai/
└── plugins/
    └── yunzai-repo-manager/
        ├── index.js
        ├── guoba.support.js
        ├── package.json
        ├── apps/
        ├── lib/
        ├── guoba/
        └── config/
```

### 升级

1. 覆盖本插件源码文件，保留现有 `config/repo-config.json` 和 `config/js-history/`。
2. 重启 Yunzai 并刷新锅巴页面。

新扩展页面也可通过锅巴“扩展页面”中的“重新扫描”加载。仓库配置表单在启动时生成，新安装仓库插件后需重启 Yunzai 刷新列表。

## 仓库插件管理

### 配置账号与地址

进入 **插件配置 → Yunzai 插件仓库管理**：

1. 按需填写各平台的用户名和 HTTPS 密码 / Token；不需要认证的平台可以留空。
2. 在对应插件分组中填写实际存在的仓库地址。没有某个平台仓库的，对应地址留空即可。
3. 选择“当前仓库平台”，保存配置。

账号配置保存后会自动同步**运行 Yunzai 的当前系统用户**的全局 Git 认证。仅修改账号时直接保存即可，无需逐个切换仓库。升级后也请保存一次，以接入全局助手并清理旧专用 helper。

首次加载仅自动填入当前 `origin` 所属平台的地址，不推测其他平台的镜像地址。保存时只校验所选平台的地址；所选地址为空时会提示先填写，不执行切换。其他平台的空值会保持为空。

地址可使用 HTTPS、`ssh://...` 或 `git@host:path` 格式，不能在 HTTPS 地址中内嵌用户名或密码。

### 账号凭据

| 平台 | HTTPS 凭据说明 |
| --- | --- |
| GitHub | 用户名 + Personal Access Token；Git HTTPS 操作不支持账号登录密码 |
| Gitee | 用户名 + 平台支持的 HTTPS 密码 / Token |
| GitCode | 用户名 + 平台提供的 HTTPS 凭据 / 个人访问令牌 |

SSH 地址使用 SSH key，不使用表单中的用户名 / 密码。

插件通过 `git config --global --add credential.helper ...` 注册凭据助手，不使用系统级配置。全局 Git 配置只保存 Node 和 `lib/git-credential.js` 的调用路径，用户名和密码 / Token 仍从原有 `config/repo-config.json` 读取，不创建额外的凭据副本。

#### 作用范围与域名隔离

- 同一系统用户、同一 HOME / Git 全局配置环境中的其他插件，以及在仓库外执行的 HTTPS `git clone`、`git pull`、`git fetch`，均可使用全局助手。
- GitHub 仅匹配 `github.com`，Gitee 仅匹配 `gitee.com`，GitCode 仅匹配 `gitcode.com` 和 `hub.gitcode.com`。不向相似域名、HTTP 地址或其他平台提供凭据。
- 每个平台必须同时填写用户名和密码 / Token。只填写一项时不返回部分凭据，避免与其他助手的账号拼接；请求显式指定另一用户名时也不返回本插件凭据。
- 修改账号配置后，助手在下次请求时读取新值；清空某个平台后停止提供其凭据。全部清空时移除本插件的全局 helper。
- 不覆盖其他助手，也不改变用户助手的配置值和调用顺序。按 [Git 官方的助手调用规则](https://git-scm.com/docs/gitcredentials)，已有助手如果先返回完整凭据，会优先生效。用户设置的本地助手重置或命令级覆盖也可能阻止全局助手生效；面板会提示检测到的配置冲突。
- 保存时清理 `plugins/`、`user_plugins/` 一级 Git 仓库中旧版插件生成的专用 helper，包括没有 `origin` 的仓库；仅删除与本插件脚本路径及生成格式匹配的命令，保留用户的其他 helper。

锅巴的“全局 Git 凭据状态”显示助手接入状态、各平台配置是否完整及冲突 / 失败提示，刷新面板可重新读取。状态仅检查本地配置，不验证 Token 有效性或网络连通性。写入失败时会反馈权限、锁文件等排查方向，并尝试回滚账号配置、仓库地址和本次 helper 变更。

GitCode HTTPS 地址支持 `gitcode.com` 和 `hub.gitcode.com`，SSH 地址也支持平台的 `*.gitcode.com` 子域名。请从实际仓库页面复制克隆地址。

参考：[GitHub 认证说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github)、[GitCode Git 集成说明](https://docs.gitcode.com/docs/help/home/general-reference/cli/)。

### 聊天命令

以下命令仅主人可用：

| 命令 | 作用 |
| --- | --- |
| `#仓库列表` | 查看已扫描的插件仓库及当前 `origin` |
| `#仓库切换 plugins/miao-plugin gitee` | 切换指定插件到已配置的 Gitee 地址 |
| `#仓库切换 插件目录 gitcode` | 切换到已配置的 GitCode 地址 |

平台参数支持 `github`、`gitee`、`gitcode`、`custom`。目录名唯一时可以只写目录名；存在重名时使用完整路径。切换前需在锅巴中填写并保存目标地址。

## JS 插件管理

进入 **扩展页面 → JS 插件管理**。文件读取、上传、新建、编辑、启停和恢复均限定在 `plugins/example/`，页面没有目录选择项。

### 文件操作

| 操作 | 行为 |
| --- | --- |
| 上传 JS | 选择本地 `.js` 文件，在编辑器确认内容后保存到 `plugins/example/` |
| 新建插件 | 填写文件名和源码，保存时可选择是否启用；目录不存在时自动创建 |
| 编辑 | 修改源码，保存前自动备份原内容 |
| 停用 | 将 `xxx.js` 改名为 `xxx.js.disabled` |
| 启用 | 将 `xxx.js.disabled` 改名为 `xxx.js` |
| 移入回收站 | 备份文件后移除原文件，可在“回收站与备份”中恢复 |
| 恢复 | 保留原文件的启停状态；遇到同名启用或停用文件时提示冲突，不覆盖 |

恢复修改前的版本时，先将现有版本移入回收站，再恢复指定备份。

### 文件要求与生效方式

- 只管理 `plugins/example/` 第一层文件，不扫描子目录；文件链接不在管理范围内。
- 单文件最大为 **1 MiB**，上传和在线编辑使用 **UTF-8** 编码。
- 文件名须以 `.js` 结尾，不能使用 `index.js` 或 `guoba.support.js`。
- 上传、新建、保存及启用前检查 JS 语法。语法检查不执行源码，不能代替运行时依赖检查。
- 源码被其他编辑器修改后，页面会提示刷新或重新打开编辑器，避免覆盖新的内容。
- 页面展示的是**文件状态**；修改后可重启 Yunzai 确保生效。

页面和接口由锅巴扩展页面机制注册，使用锅巴登录鉴权。接入方式见 [guoba-plugin-next 扩展页面说明](https://github.com/cchanlan/guoba-plugin-next/blob/master/docs/custom-page.md)。

## 配置与备份

以下路径均相对于 `plugins/yunzai-repo-manager/`：

| 路径 | 内容 | 升级时处理 |
| --- | --- | --- |
| `config/default.json` | 默认空配置 | 随源码更新 |
| `config/repo-config.json` | 平台账号凭据、插件仓库地址及平台选择 | 保留 |
| `config/js-history/` | JS 回收站文件及修改前备份 | 保留 |

凭据以明文保存在本地配置中，请勿提交到 Git 或公开分享。Linux / macOS 下插件尽可能将配置文件权限设为仅当前用户可读写；Windows 由系统 ACL 控制。

全局认证不限于 Yunzai：同一系统用户运行的其他 Git 客户端也可能读取这些平台凭据。建议使用权限最小、可撤销的 Token，并通过 HTTPS 访问锅巴面板。不同系统用户、容器、HOME 或服务环境不会自动共享此配置。

凭据不会写入 remote URL、Git 命令参数或日志。helper 仅通过 Git 的标准输入 / 输出传递认证数据，不处理 `store` / `erase` 请求。已有 `store`、系统钥匙串等助手可能自行保存认证数据；清空本插件不会删除这些工具保存的凭据，如需彻底撤销访问，应在平台撤销 Token，并通过对应工具清理缓存。

全局 helper 引用本插件和 Node 的绝对路径。移动插件或更换 Node 路径后需重新检查配置并保存；卸载插件前先在锅巴中清空全部平台凭据并保存，以移除本插件的全局注册。

升级后，其他目录的旧 JS 备份仍保留在磁盘上，但本页面仅显示和恢复 `plugins/example/` 的记录。

## 常见问题

### 其他插件仍要求输入账号

先保存账号配置，再刷新查看“全局 Git 凭据状态”。确认 Yunzai 与执行 Git 的进程属于同一系统用户，且使用相同 HOME / Git 全局配置；平台用户名和密码 / Token 必须同时填写。

已有助手优先返回旧账号、仓库本地的空 helper 重置、命令级 `-c credential.helper=...` 或环境变量覆盖，都可能影响助手调用。插件会保留用户配置，请按状态提示自行处理冲突。SSH 使用 SSH key，不使用这里的 HTTPS 凭据。

### 保存全局认证失败

检查当前系统用户是否能写入 Git 全局配置和相关仓库的 `.git/config`，以及是否存在仍被其他 Git 进程占用的配置锁文件。处理原因后重新保存；不要在 Git 正在运行时删除锁文件。查看面板反馈，必要时检查回滚结果。

### 插件配置里没有仓库管理入口

确认插件直接位于 `plugins/yunzai-repo-manager/`，没有多套一层目录，并保留根目录的 `guoba.support.js`。重启 Yunzai 后刷新锅巴页面；仍未显示时查看 Yunzai 的插件加载日志。

### 找不到 JS 插件管理页面

入口位于锅巴的 **扩展页面**。确认安装包中的 `guoba/` 目录完整，重启 Yunzai 或使用扩展页面中的“重新扫描”。

### 仓库列表中缺少某个插件

仓库管理只列出 `plugins/`、`user_plugins/` 一级目录下带 `.git` 和 `origin` 的 Git 插件仓库，本插件自身不列出。新安装插件后重启 Yunzai。

### JS 列表为空

将单文件插件放入 `plugins/example/` 第一层，或直接在页面上传 / 新建。支持的文件后缀为 `.js`、`.js.disabled`；超出大小限制或非 UTF-8 文件会显示提示。

### 恢复时提示同名文件已存在

现有 `.js` 或 `.js.disabled` 文件均会阻止恢复。先将现有文件移入回收站，再恢复目标记录。

## 测试

```bash
npm test
```

测试使用临时 HOME、临时 Git 全局配置和 Git 仓库，禁用系统 Git 配置，不改动运行测试的用户的真实全局配置。涵盖平台隔离、修改和清空、用户助手 / include 保留、旧 helper 清理、锁文件失败回滚，以及仓库切换和 JS 管理回归。

HTTPS 集成测试使用本地服务器和虚拟账号，模拟 GitHub、Gitee、GitCode 的 `clone`、`fetch`、`pull`，需要系统可使用 OpenSSL（Windows 也会查找 Git 自带的 OpenSSL）。仅测试进程关闭测试服务器的证书校验，不修改真实 Git 的 TLS 配置，也不访问真实平台进行认证。
