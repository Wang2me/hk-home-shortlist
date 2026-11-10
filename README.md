# 安居候选簿：腾讯云家庭共享版

腾讯云 CloudBase 静态托管负责显示网页，CloudBase 云函数与数据库负责家庭数据同步、DeepSeek 联网找房和腾讯地图通勤计算。GitHub 仓库作为源代码和自动部署来源。DeepSeek 与地图密钥只存放在云函数环境变量中，不会暴露给网页访客。

## 功能

- 家庭成员使用同一个私密邀请码，共享新增、编辑、评分、喜欢和备注
- 每 30 秒自动刷新，也会在每次保存后立即写入云端
- DeepSeek 官方 Search API 联网搜索房源，再由模型提取结构化资料
- 腾讯位置服务根据地址计算到港澳码头、上环站的步行时间，以及到金钟的公交时间
- 保留 JSON 导入、导出和浏览器本地备份

## 第一步：创建 CloudBase 环境

1. 登录[腾讯云 CloudBase 控制台](https://tcb.cloud.tencent.com/)，创建一个云开发环境，建议选择上海地域和文档型数据库。
2. 在文档数据库中新建集合 `properties`，权限设为**仅管理员可读写**。网页不会直接访问数据库，全部操作经云函数完成。
3. 在“API Key 配置”中创建 Web 端 **Publishable Key**。
4. 在“身份认证 → 登录方式”开启“用户名密码登录”。
5. 在“身份认证 → 用户管理”手动创建每位家庭成员的注册用户。关闭公开注册，只保留管理员手动创建的账号。
6. 在“身份认证 → 策略管理”中，将云函数调用策略（通常名为 `FunctionsHttpApiAllow`）关联到“注册用户”。不要关联“默认访客”。策略保存后可能需要约 3 分钟生效。

家庭账号密码不要写入代码或 GitHub。数据库集合仍保持“仅管理员可读写”，网页的数据请求全部经过 `home-api`。

## 第二步：部署云函数

在 CloudBase 控制台新建**普通云函数（事件函数）** `home-api`，不要选择 HTTP 云函数。选择 Node.js 18 或更高版本，将 `cloudfunctions/home-api` 目录中的文件上传为函数代码，并安装依赖。

如果使用 ZIP 上传，ZIP 根目录必须直接包含 `index.js` 和 `package.json`，不能在外层再套一层文件夹。项目根目录已经提供可直接上传的 `home-api.zip`（该临时部署包不会提交到 GitHub）。上传后点击“保存并安装依赖”。如果出现缺少 `scf_bootstrap`，说明误建成了 HTTP 云函数；请重新创建普通云函数。

为函数添加以下环境变量：

| 名称 | 内容 |
|---|---|
| `FAMILY_SALT` | 自己生成的一段至少32位随机字符，只设置一次，之后不要更改 |
| `DEEPSEEK_API_KEY` | DeepSeek 开放平台创建的 API Key |
| `TENCENT_MAP_KEY` | 腾讯位置服务中创建的 WebService API Key |

密钥不要写入 `config.js`、GitHub 仓库或家庭邀请码中。

腾讯位置服务的 Key 需要开通地址解析、步行距离矩阵和公交路线规划。若公交接口尚未获批，到金钟时间会保留为空，其他两项仍可计算。

## 第三步：连接网页

打开 `config.js`，只替换以下两个公开值：

```js
window.HOME_CLOUD_CONFIG = {
  envId: "你的 CloudBase 环境 ID",
  region: "ap-shanghai",
  publishableKey: "你的 Publishable Key",
  functionName: "home-api"
};
```

Publishable Key 是网页端公开凭据，可以放在 GitHub Pages；DeepSeek、腾讯地图密钥不可以。

## 第四步：从 GitHub 自动部署到 CloudBase

推荐在 CloudBase“静态网站托管”中选择“Git 仓库部署”，连接仓库：

```text
https://github.com/Wang2me/hk-home-shortlist
```

填写以下构建设置：

| 设置 | 内容 |
|---|---|
| 分支 | `main` |
| 项目根目录 | `.` 或 `/` |
| Node.js | 18 或更高 |
| 安装命令 | 留空 |
| 构建命令 | `npm run build` |
| 构建产物目录 | `dist` |
| 部署路径 | `/` |
| 自定义部署命令 | 留空 |

开启“代码更新后自动部署”。CloudBase会先运行 `npm run build` 生成 `dist`，然后由平台使用内部身份上传构建产物。不要在构建命令或自定义部署命令中调用 `tcb hosting deploy`；构建容器没有CLI登录身份，会报 `No valid identity information`。

仓库构建脚本只会把 `index.html`、CSS、前端 JavaScript 和公开配置复制到 `dist`，不会发布 README 或云函数源码。

部署成功后，使用 CloudBase 提供的 `*.tcloudbaseapp.com` 默认域名访问。GitHub Pages 可以继续保留作静态备份，但由于 `github.io` 是共享域名，CloudBase 网关可能拒绝其跨域请求。

### 仅使用 GitHub Pages（备份方式）

把本文件夹中的以下内容上传到 `home` 仓库根目录：

- `index.html`
- `styles.css`
- `app.js`
- `cloud.js`
- `config.js`
- `.nojekyll`

`cloudfunctions` 和 `cloudbaserc.json` 可以一起保存在仓库中用于后续维护，但不会被网页直接执行。

GitHub Pages 保持 `main` 分支和 `/ (root)` 发布。当前仓库的默认网站地址是 `https://wang2me.github.io/hk-home-shortlist/`，Custom domain 留空。

## 第五步：家庭成员加入

1. 管理员把各自的家庭账号和初始密码私下发给家人。
2. 第一个人打开网页，点击顶部“登录家庭账号”，登录后自行设定一个至少 10 位的邀请码，建议使用 12 位以上随机字母和数字。
3. 把**同一个邀请码**私下发给家人。
4. 家人在自己的设备登录各自账号，并输入相同邀请码，即可看到同一份清单。

邀请码和账号密码都不会上传到 GitHub。浏览器会保存登录状态和当前设备使用的邀请码。

## 使用智能找房

连接家庭云后，点击“智能找房”，用自然语言补充区域、预算、装修、楼龄或通勤偏好。系统会：

1. 使用 DeepSeek Search 搜索实时网页；
2. 提取价格、面积、地址、装修和来源链接；
3. 先显示待确认结果；
4. 只有勾选并点击加入后才写入家庭清单。

网络房源可能已下架、重复或标价变化，约看前必须打开来源核实。自动月供不含印花税、佣金、律师费、按揭保险和装修费用。
