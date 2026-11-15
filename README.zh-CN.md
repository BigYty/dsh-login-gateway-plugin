# DSH 登录网关插件

一个面向 DSH Web 的安全登录网关与设置插件，为 DSH 实例增加登录保护、Cloudflare Turnstile、人性化登录页配置和账号管理功能。

> **强烈建议通过 DSH 面板 AI 安装。**
>
> 这是一个同时包含 DSH 设置插件、Node.js 认证网关和反向代理配置的完整方案。只安装前端插件并不会自动保护 DSH。请打开 DSH Web 面板，让面板内的 AI 检查并安装本仓库。

## 功能

- 用户名和密码登录保护
- Cloudflare Turnstile 人机验证
- 登录失败提示和缺失字段提示
- 登录会话使用 Secure、HttpOnly、SameSite Cookie
- 账号、密码修改和当前会话退出
- 登录页背景图片 URL
- PNG、JPEG、WebP 背景图片上传，单文件最大 4 MiB
- BTSTU 每日壁纸 JSON API
- `3650000.xyz` 图片 API
- 自定义登录页 HTML、CSS 和 JavaScript
- 自定义代码运行在独立沙箱 iframe 中，可自行制作挂件、音乐播放器、下雪、下雨等效果
- 核心登录框和 Turnstile 区域不允许自定义代码访问或修改
- Turnstile 密钥更换前先由 Cloudflare 验证，失败自动保留旧密钥
- 设置页将账号、外观、Turnstile 和会话操作的提示分别显示

## 必须通过 DSH 面板 AI 安装

请不要直接把网关文件复制到生产服务器后运行。正确方式是：

1. 打开 DSH Web 面板。
2. 确认 DSH 的“设置 → 模型”已经配置可用的 Provider、模型和 API 凭据。
3. 如果尚未配置，先让 DSH 面板 AI 引导你完成模型设置。
4. 将本仓库地址交给 DSH 面板 AI，让它阅读 [`INSTALL_WITH_DSH_AI.md`](./INSTALL_WITH_DSH_AI.md)。
5. 让 AI 先检查当前 DSH、Nginx、TLS、端口和已有插件配置。
6. 让 AI 说明准备修改的服务和反向代理配置，确认后再执行。
7. 安装 `plugin/` 目录中的 DSH 插件，并配置网关服务。
8. 验证登录、Turnstile、登出、账号修改和恢复路径后再启用强制拦截。

仓库中的 [`INSTALL_WITH_DSH_AI.md`](./INSTALL_WITH_DSH_AI.md) 是给 DSH 面板 AI 使用的安装交接说明。

## 敏感信息要求

以下信息必须在目标服务器或对应服务的本地设置中配置，**不要发到聊天、GitHub Issue、Pull Request 或仓库文件中**：

- DSH 面板 AI 使用的 Provider API Key
- Cloudflare Turnstile Secret Key
- 登录网关初始密码
- Session 签名密钥
- TLS 证书私钥
- 账号凭据文件
- Cookie 和生产日志

DSH 的 Provider、模型和 API Key 应在 DSH 面板“设置 → 模型”中配置。不要把 AI API Key 粘贴给安装 AI，也不要把它写入本仓库。

网关配置文件应使用 root 或服务账号可读、其他用户不可读的权限，例如 `0600`。密码应通过仓库提供的交互式工具生成 scrypt 哈希，不要把明文密码写入配置或命令行历史。

## 自定义登录页效果

设置页的自定义编辑框允许编写自己的 HTML、CSS 和 JavaScript。可以自行制作：

- 登录页挂件
- 音乐播放器
- 下雪或下雨效果
- 动画背景
- 自定义提示和视觉元素

代码不是直接注入核心登录页，而是在全屏隔离 iframe 中运行。它不能读取父页面 DOM、用户名、密码、Turnstile、Cookie，也不能提交父页面表单。核心登录框和人机验证区域始终由网关控制。

## 背景图片

可以使用 HTTPS 图片直链，也可以使用支持的每日图片接口。

例如 3650000 API：

```text
http://3650000.xyz/api/?type=img&mode=3,5,7,8,9
```

该接口实际返回 HTML 页面，而不是直接返回图片。网关会在服务端解析图片地址，只接受受限的腾讯图片域名，并将图片地址升级为 HTTPS。

也支持 BTSTU API：

```text
https://apis.btstu.cn/sjbz/api.php?lx=dongman&format=images
```

文档中的 `apis.btstu.cn` 会被规范到 TLS 证书有效的 `api.btstu.cn`，不会关闭证书校验。

## Turnstile 密钥更换

设置页不会显示当前 Site Key 或 Secret Key。更换流程如下：

1. 输入新的 Site Key、Secret Key 和当前登录密码。
2. 网关在新页面中使用候选 Site Key 加载 Turnstile。
3. 用户完成 Cloudflare 验证。
4. 网关使用候选 Secret Key 调用 Cloudflare Siteverify。
5. 只有 hostname 和 action 校验成功后才保存新密钥。
6. 验证失败、超时或保存失败时，继续使用旧密钥。

## 目录

- `plugin/`：DSH Web 设置插件
- `gateway/`：Node.js 认证网关、登录页面和测试
- `deploy/`：systemd 与 Nginx 通用模板
- `INSTALL_WITH_DSH_AI.md`：DSH 面板 AI 安装交接说明
- `SECURITY.md`：安全策略
- `PUBLISH_CHECKLIST.md`：GitHub 发布检查清单

## 测试

需要 Node.js 22.19 或更高版本：

```sh
cd gateway
npm test
```

测试使用模拟凭据和模拟 Cloudflare/图片接口，不包含可用的生产密钥。

## 安全提醒

不要关闭 HTTPS、Turnstile、Origin 校验或会话校验来绕过安装问题。网关应只监听本机回环地址，Nginx 应保护所有 DSH 路由。启用登录门禁前，请确保有可用的恢复路径。

英文介绍请查看 [`README.md`](./README.md)。
