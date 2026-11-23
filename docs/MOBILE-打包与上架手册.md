# 移动端打包与上架手册

面向 `apps/mobile` 的 iOS / Android 发版流程。技术栈为 Expo SDK 54 + React Native 0.81.5（新架构开启），managed 工作流——仓库里没有 `ios/`、`android/` 目录，原生工程由 CNG（Continuous Native Generation）在构建时生成。

本文所有版本号、权限、SDK 级别均来自本机实际 `prebuild` 产物核对，不是推测值。

---

## 一、当前状态与缺口

### 已就绪

| 项目 | 现状 |
| --- | --- |
| 应用标识 | iOS `bundleIdentifier` / Android `package` 均为 `app.lingwu.mobile` |
| 图标 | `assets/icon.png` 1024×1024 RGB 无 alpha；Android 自适应图标含安全区 |
| 启动图 | `expo-splash-screen` 已接入，180pt，白底 |
| SDK 级别 | Android compileSdk 36 / targetSdk 36 / minSdk 24；iOS 部署目标 15.1 |
| 新架构兼容 | `react-native-pdf`、`react-native-blob-util`、`react-native-view-shot`、`react-native-webview` 均带 `codegenConfig` |
| 权限 | 仅 `INTERNET`、`ACCESS_NETWORK_STATE`、`VIBRATE`、`DOWNLOAD_WITHOUT_NOTIFICATION`；已移除悬浮窗与外部存储权限 |
| 网络安全 | iOS `NSAllowsArbitraryLoads: false`（ATS 合规，无需审核解释） |
| 本地化 | 中文设备显示「灵悟」，英文显示「LingWu」 |
| 出口合规 | `ITSAppUsesNonExemptEncryption: false`，免每次上传被追问 |
| 构建配置 | `eas.json` 三档 profile；`package.json` 内置 `build:apk` / `build:aab` / `build:ipa` / `submit:*` |

### 仍缺的三类

**1. 需要你的账号，我无法代办**

- EAS 项目未初始化：`app.json` 里没有 `extra.eas.projectId`，必须登录后由 `eas init` 写入
- App Store Connect 中尚未创建 App 记录（首次上传前必须建好）
- Google Play 开发者账号与首个 AAB 上传（Google 不允许用 API 创建首个版本）

**2. 构建期变量待确认**

`eas.json` 三个 profile 里的 `EXPO_PUBLIC_API_URL` 目前是推断值 `https://lingwu-api.onrender.com`（按 `render.yaml` 的服务名推的 Render 默认域名）。**未经核实**，上线前需要确认真实域名。

**3. 上架材料**

隐私政策 URL、商店截图（多尺寸）、应用描述、App 隐私问卷、Google Play 数据安全表单。这些不是代码问题，但不准备就无法提审。

### 本机环境限制

```
xcode-select -p  →  /Library/Developer/CommandLineTools   （没有 Xcode）
ANDROID_HOME     →  空                                     （没有 Android SDK）
java -version    →  21.0.4                                 （JDK 可用）
```

本机**无法**产出签名安装包：iOS 缺 Xcode，Android 缺 SDK。这不是配置问题，是工具链缺失。云构建因此不是"更快的选择"，而是当前唯一可行路径。若要本地调试原生层，需装 Xcode 16 与 Android Studio。

---

## 二、一次性初始化

```sh
cd apps/mobile
npx eas-cli login          # 浏览器授权，凭据存本地
npx eas-cli init           # 创建/关联 EAS 项目，写入 extra.eas.projectId
```

`eas init` 会修改 `app.json`，这是预期行为，把改动提交进仓库。初始化后 EAS 控制台会出现 `lingwu` 项目，构建历史与证书都在那里管理。

> 仓库是 pnpm monorepo。在 `apps/mobile` 目录执行命令即可，EAS 会自动定位 workspace 根并按 `pnpm-lock.yaml` 安装依赖。

---

## 三、构建档位

| Profile | 产物 | 分发方式 | 用途 |
| --- | --- | --- | --- |
| `development` | APK / dev-client | 内部 | 日常开发，支持 JS 热重载与原生调试 |
| `preview` | APK / .ipa | 内部（Ad Hoc） | 真机验收，不需要商店账号 |
| `production` | AAB / .ipa | 商店 | 提审发布，版本号自动递增 |

```sh
pnpm --dir apps/mobile build:apk    # Android 内测 APK
pnpm --dir apps/mobile build:aab    # Android 上架包
pnpm --dir apps/mobile build:ipa    # iOS 上架包
```

首次构建约 15–25 分钟（含依赖安装与原生编译），之后命中缓存会快很多。免费额度够试点，但排队优先级低；高频发版需要付费计划。

构建完成后 EAS 给出下载链接，Android 的 APK 可直接发给测试者，iOS 的 .ipa 需要通过 TestFlight 或 Ad Hoc 安装。

---

## 四、Android 上架

### 4.1 签名

EAS 会在首次 `production` 构建时自动生成 keystore 并托管在 Expo 服务器，不需要手动 `keytool`。**务必在 EAS 控制台备份这份 keystore**——丢失后无法对已上架应用发布更新。

### 4.2 上传

1. 注册 Google Play 开发者账号（一次性 25 美元）
2. Play Console 创建应用，填写默认语言、应用名、分类
3. 手动上传 `production` 产出的 `.aab`（首个版本必须手动传，之后可用 `pnpm submit:android`）
4. 完成「数据安全」表单：本应用收集账号邮箱、持仓与自选数据，需如实勾选
5. 内容分级问卷
6. 内部测试 → 封闭测试 → 正式发布

> 新注册的个人开发者账号通常需要先完成封闭测试（满足测试人数与持续天数要求）才能申请正式发布，具体门槛以 Play Console 当期政策为准。

### 4.3 权限说明

当前权限清单已经是最小集合。如果后续功能引入新的敏感权限（定位、相机、通讯录），Play 会要求提交权限使用说明，审核周期会变长。

---

## 五、iOS 上架

### 5.1 证书与描述文件

EAS 可全自动管理：首次 `build:ipa` 时用 Apple ID 登录（需要 Apple Developer Program 会员），自动生成 Distribution Certificate 与 Provisioning Profile，并存到 Expo 服务器复用。

### 5.2 App Store Connect

首次上传前必须先建 App 记录：

1. App Store Connect → 我的 App → 新建
2. 平台选 iOS，名称「灵悟」，主要语言简体中文
3. Bundle ID 选 `app.lingwu.mobile`（需先在 Certificates 里注册该 Bundle ID）

### 5.3 分发路径

- **TestFlight**：上传后自动可用，内部测试员（最多 100 人）无需审核即可安装；外部测试需一次 Beta 审核。这是 iOS 内测最省事的方式。
- **Ad Hoc**：需收集每台设备的 UDID，每年上限 100 台，适合固定小范围。
- **App Store**：正式提审。

```sh
pnpm --dir apps/mobile build:ipa
pnpm --dir apps/mobile submit:ios
```

`submit:ios` 需要 `eas.json` 里补 `ascAppId`（App Store Connect 的数字 ID）与 `appleId`，首次可交互式填写。

### 5.4 提审材料

- 隐私政策 URL（必需，且必须在 App 内可访问）
- App 隐私问卷：需申报收集的数据类型（邮箱、用户内容、标识符）
- 截图：6.9 吋 iPhone 与 13 吋 iPad 为必需尺寸
- 演示账号：应用需要登录才能使用，审核时必须提供可用的测试账号
- 审核备注：说明第三方登录方式与「连接器」需要用户自行配置

审核时长通常 1–3 天，首次会更久。

---

## 六、构建期变量（关键）

`EXPO_PUBLIC_API_URL` 是**编译期内联**的。`src/api.ts` 的逻辑是：

```ts
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://127.0.0.1:8787")
).replace(/\/$/, "");
```

没有运行时覆盖机制。这意味着：

- 打包时填错地址 → 安装后永远连不上后端，界面停在空白或登录失败
- 真机不会回落到 `localhost`，`10.0.2.2` 只对 Android 模拟器有效
- 改地址必须重新构建，改代码无法补救

三个 profile 都通过 `eas.json` 的 `env` 注入。切换环境时改这三处，或临时覆盖：

```sh
npx eas-cli build --platform android --profile preview --env EXPO_PUBLIC_API_URL=https://你的域名
```

本地用局域网真机调试时，填 Mac 的局域网 IP（如 `http://192.168.1.20:8787`），并确认后端 `HOST` 监听 `0.0.0.0`。

---

## 七、版本号规则

`eas.json` 设了 `cli.appVersionSource: "remote"`，版本号由 EAS 服务器托管，`app.json` 里的 `buildNumber` / `versionCode` 仅作初始值，首次构建后被远程值接管。

| 字段 | 含义 | 何时改 |
| --- | --- | --- |
| `expo.version` | 用户可见版本，如 `1.0.0` | 每次功能发版手动改 |
| `ios.buildNumber` | iOS 内部构建号 | 由 `autoIncrement` 自动递增 |
| `android.versionCode` | Android 内部构建号 | 由 `autoIncrement` 自动递增 |

两个平台的内部构建号只能升不能降，同一个值不能重复上传。`autoIncrement` 只在 `production` profile 开启，所以 `preview` 多次构建会复用同一个版本号——用于覆盖安装，这是预期行为。

提审前把 `expo.version` 从 `0.1.0` 改成 `1.0.0`，首发版本留 0.x 容易被商店和用户视为不稳定版本。

---

## 八、OTA 热更新（可选，建议二期）

当前未接入 `expo-updates`。接入后可以不重新提审就修复 JS 层问题，代价是每次更新仍需遵守商店规则（不能改变应用主要功能）。

接入前提是 `projectId` 已存在，因此顺序是：先 `eas init`，再：

```sh
cd apps/mobile && npx expo install expo-updates
```

然后在 `app.json` 补：

```json
{
  "runtimeVersion": { "policy": "appVersion" },
  "updates": { "url": "https://u.expo.dev/<projectId>" }
}
```

`eas.json` 各 profile 加 `channel`（如 `"channel": "production"`），重新构建一次以让原生层携带更新能力。此后：

```sh
npx eas-cli update --channel production --message "修复登录页文案"
```

注意 `runtimeVersion` 用 `appVersion` 策略时，改变 `expo.version` 会切断旧版本的更新通道，发版节奏要与之对齐。

---

## 九、排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 构建失败在 `pod install` | 原生依赖版本冲突 | 看 EAS 日志里第一个 error；本地 `npx expo prebuild --clean` 复现 |
| 安装后打开白屏 | `EXPO_PUBLIC_API_URL` 指向不可达地址 | 改成公网 HTTPS 地址重新构建 |
| Android 崩溃在 PDF 页面 | `react-native-pdf` 需要原生模块 | 确认用的是 dev-client 或正式包，Expo Go 不支持 |
| iOS 上传报版本号重复 | buildNumber 已用过 | 依赖 `autoIncrement`，或手动改大 |
| 中文设备显示 LingWu | `locales` 未生效 | 确认 `app.json` 的 `locales` 键为 `zh-Hans` 且文件内有 `app_name` |
| 构建排队很久 | 免费额度低优先级 | 非紧急改用 `preview`，或升级计划 |

诊断配置是否正常，随时可跑：

```sh
npx expo-doctor
npx expo prebuild --clean --no-install   # 验证原生工程能否生成
```

`expo-doctor` 有一项已知告警：`metro.config.js` 的 `watchFolders` 覆盖了 Expo 默认值。这是仓库既有配置，本地与 Render 构建均正常，暂不修改。

---

## 十、发布检查清单

**每次发版前**

- [ ] `expo.version` 已更新
- [ ] `EXPO_PUBLIC_API_URL` 指向生产域名且健康检查通过（`/api/health`）
- [ ] `pnpm --dir apps/mobile typecheck` 通过
- [ ] 真机跑一遍核心链路：登录、对话、PDF 阅读、文件导出、分享

**iOS 首次提审**

- [ ] App Store Connect App 记录已创建，Bundle ID 匹配
- [ ] 隐私政策 URL 可访问且在 App 内可达
- [ ] App 隐私问卷已填
- [ ] 6.9 吋 iPhone + 13 吋 iPad 截图齐备
- [ ] 提供审核用测试账号

**Android 首次提审**

- [ ] Play Console 应用已创建，包名匹配
- [ ] AAB 已上传至内部测试轨道
- [ ] 数据安全表单已填
- [ ] 内容分级问卷完成

**长期**

- [ ] EAS 控制台的 Android keystore 已备份到密码管理器
- [ ] Apple Distribution Certificate 有效期已记录
