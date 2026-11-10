# 安居候选簿：腾讯云家庭共享版

GitHub Pages 负责显示网页；腾讯云 CloudBase 负责家庭数据同步、DeepSeek 联网找房和腾讯地图通勤计算。DeepSeek 与地图密钥只存放在云函数环境变量中，不会暴露给网页访客。

## 功能

- 家庭成员使用同一个私密邀请码，共享新增、编辑、评分、喜欢和备注
- 每 30 秒自动刷新，也会在每次保存后立即写入云端
- DeepSeek 官方 Search API 联网搜索房源，再由模型提取结构化资料
- 腾讯位置服务根据地址计算到港澳码头、上环站的步行时间，以及到金钟的公交时间
- 保留 JSON 导入、导出和浏览器本地备份

## 第一步：创建 CloudBase 环境

1. 登录[腾讯云 CloudBase 控制台](https://tcb.cloud.tencent.com/)，创建一个云开发环境，建议选择上海地域和文档型数据库。
2. 在“身份认证 → 登录方式”中启用**匿名登录**。
3. 在文档数据库中新建集合 `properties`，权限设为**仅管理员可读写**。网页不会直接访问数据库，全部操作经云函数完成。
4. 在“API Key 配置”中创建 Web 端 **Publishable Key**。

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

## 第四步：更新 GitHub Pages

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

1. 第一个人打开网页，点击顶部“配置家庭云”。
2. 自己设定一个至少 10 位的邀请码，建议使用 12 位以上随机字母和数字。
3. 把**同一个邀请码**私下发给家人。
4. 家人在自己的设备打开网页，点击“连接家庭云”，输入邀请码即可看到同一份清单。

邀请码不会上传到 GitHub，但知道邀请码的人可以访问家庭清单，因此不要在公开群组或网页中展示。浏览器会在当前设备保存邀请码。

## 使用智能找房

连接家庭云后，点击“智能找房”，用自然语言补充区域、预算、装修、楼龄或通勤偏好。系统会：

1. 使用 DeepSeek Search 搜索实时网页；
2. 提取价格、面积、地址、装修和来源链接；
3. 先显示待确认结果；
4. 只有勾选并点击加入后才写入家庭清单。

网络房源可能已下架、重复或标价变化，约看前必须打开来源核实。自动月供不含印花税、佣金、律师费、按揭保险和装修费用。
