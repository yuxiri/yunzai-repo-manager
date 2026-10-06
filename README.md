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

首次加载仅自动填入当前 `origin` 所属平台的地址，不推测其他平台的镜像地址。保存时只校验所选平台的地址；所选地址为空时会提示先填写，不执行切换。其他平台的空值会保持为空。

地址可使用 HTTPS、`ssh://...` 或 `git@host:path` 格式，不能在 HTTPS 地址中内嵌用户名或密码。

### 账号凭据

| 平台 | HTTPS 凭据说明 |
| --- | --- |
| GitHub | 用户名 + Personal Access Token；Git HTTPS 操作不支持账号登录密码 |
| Gitee | 用户名 + 平台支持的 HTTPS 密码 / Token |
| GitCode | 用户名 + 平台提供的 HTTPS 凭据 / 个人访问令牌 |

SSH 地址使用 SSH key，不使用表单中的用户名 / 密码。

配置了平台凭据后，插件会给相应 HTTPS 仓库添加本地 Git credential helper。凭据从本插件配置文件读取，不写入 remote URL 或各仓库的 `.git/config`；后者只保存 helper 调用命令。

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

升级后，其他目录的旧 JS 备份仍保留在磁盘上，但本页面仅显示和恢复 `plugins/example/` 的记录。

## 常见问题

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
