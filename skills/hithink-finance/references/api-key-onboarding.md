# 首次登录、API Key 创建与持久配置

本页用于 REST API 与 API Key 调用方的凭据创建、复用、持久配置和验证。具备浏览器与本地环境操作能力的 Agent 可完成配置，用户也可自行操作后通过安全输入交接。

## 推荐路径

1. **先复用本地凭据**：检查用户级 `HITHINK_FINANCE_API_KEY`、用户级 `credentials.env`。已有 Key 通过最小真实请求时直接结束，不创建重复 Key。
2. **打开正确入口**：使用 <https://fuyao.aicubes.cn/admin/>。必须保留末尾 `/`；不带末尾 `/` 的管理页当前会从 HTTPS 重定向到 HTTP，导致扫码后的登录态无法保存。
3. **只让用户完成扫码**：使用用户设备上的可见本地浏览器。未登录时进入 <https://fuyao.aicubes.cn/login/>，切换到“同花顺APP / 扫一扫登录”。确认窗口实际可见后再提示用户扫码。登录成功后返回 HTTPS 管理页。
4. **复用或签发 Key**：管理页“已创建 API Key”表格包含“别名 / API Key / 操作”，已有项可“查看”或“删除”。优先查看并复用已有 Key；确需新建时点击“创建 API Key”，在“获取 API Key”对话框填写最长 64 字符的“别名”，再点击“签发 API Key”。
5. **交给 Agent 配置**：Agent 可读取页面中的 Key、使用复制粘贴、浏览器内存、stdin、临时进程环境或其他当前工具支持的方式完成配置。用户也可以直接把 Key 提供给 Agent 上下文；Agent 接收后不复述，并提示聊天平台可能保留消息记录。
6. **写入持久来源**：至少建立一个跨会话持久来源，并让当前任务立即可用。推荐同时配置用户级 `HITHINK_FINANCE_API_KEY` 和用户级 `credentials.env`；当前请求使用同一来源，支持 Secret 的客户端按其机制配置。
7. **分层验收**：确认持久来源存在且非空；最后执行一个有界真实请求，检查 HTTP 与 JSON 业务信封 `code=0` 及实际数据。

## 跨平台持久配置

| 平台 | 推荐持久来源 | 用户级凭据文件 | 注意事项 |
| --- | --- | --- | --- |
| Windows | User scope 的 `HITHINK_FINANCE_API_KEY` | `%APPDATA%\hithink-finance\credentials.env` | 设置 User scope 后，当前已运行的 Agent 不会自动继承；本次任务应同时注入自己的子进程，不要求用户重启 |
| macOS | 用户 Shell 环境或客户端 Secret | `~/Library/Application Support/hithink-finance/credentials.env` | 默认 zsh 可写入 `~/.zshenv`；GUI 客户端不继承 Shell 时使用其 Secret，或由 Agent 直接读取用户级文件 |
| Linux | 用户 Shell 环境、`environment.d` 或客户端 Secret | `${XDG_CONFIG_HOME:-~/.config}/hithink-finance/credentials.env` | 根据桌面与 Shell 选择持久机制；不要写系统级 `/etc/environment` 或要求 sudo |

`credentials.env` 只写一行 `HITHINK_FINANCE_API_KEY=...`，不放在项目目录。Unix 目录建议 `0700`、文件 `0600`；Windows 限制为当前用户可读写。更新时优先使用同目录临时文件加原子替换。

## 隐藏输入与持久配置示例

需要自行配置当前用户的持久环境变量时，按当前平台使用隐藏输入。Windows PowerShell：

```powershell
$secureKey = Read-Host 'API Key' -AsSecureString
$key = [System.Net.NetworkCredential]::new('', $secureKey).Password
[Environment]::SetEnvironmentVariable('HITHINK_FINANCE_API_KEY', $key, 'User')
$env:HITHINK_FINANCE_API_KEY = $key
Remove-Variable key, secureKey
```

macOS 默认 zsh：

```zsh
read -s 'HITHINK_FINANCE_API_KEY?API Key: '; echo
export HITHINK_FINANCE_API_KEY
printf '\nexport HITHINK_FINANCE_API_KEY=%q\n' "$HITHINK_FINANCE_API_KEY" >> ~/.zshenv
chmod 600 ~/.zshenv
```

Linux Bash：

```bash
read -rsp 'API Key: ' HITHINK_FINANCE_API_KEY; echo
export HITHINK_FINANCE_API_KEY
printf '\nexport HITHINK_FINANCE_API_KEY=%q\n' "$HITHINK_FINANCE_API_KEY" >> ~/.bashrc
chmod 600 ~/.bashrc
```

## 必要避坑

- **管理页尾斜杠**：始终使用 <https://fuyao.aicubes.cn/admin/>，并在扫码前后确认地址栏仍为 HTTPS。
- **窗口必须真实可见**：自动化工具返回“已打开”不等于用户能看到窗口。提示扫码前确认会话仍在运行、窗口未最小化且已显示二维码。
- **复制不一定进入系统剪贴板**：隔离浏览器可能使用自己的剪贴板。复制后无法读取时，改用浏览器上下文读取、用户直接提供 Key 或其他可用通道，不要重复签发 Key。
- **创建和配置是两层成功**：管理页出现新别名只证明签发完成；持久来源读回和真实请求通过后才算配置完成。
- **核验实际请求**：从已保存来源读取 Key，执行有界 HTTP 请求并检查业务结果；环境变量或文件存在不能代替服务端验权。
- **避免不必要的重复扫码**：登录态异常先检查 HTTP 降级、浏览器窗口、第三方 Cookie 和登录 iframe 是否来自 `https://upass.aicubes.cn/login`。

## 凭据边界

为了减少用户操作，API Key 可以由用户主动提供给 Agent 上下文，也可以由浏览器操作结果交给 Agent。Agent 应说明聊天平台可能保留上下文，并遵循以下边界：

- 不复述或展示收到的 Key。
- 不把 Key 写入代码、README、Issue、日志、测试产物、项目配置或 Git。
- 不把 Key 放进命令行参数；优先使用 stdin、进程环境、用户级凭据文件、系统凭据库或客户端 Secret。
- 配置和验证完成后清理临时变量、临时文件和剪贴板中的 Key；持久来源按用户要求保留。

最终只报告使用的持久来源、真实请求是否通过，以及仍需用户处理的唯一动作。
