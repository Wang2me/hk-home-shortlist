# 安居候选簿

一个无需后端的香港自住房源家庭筛选网页。资料保存在每台设备的浏览器中，可通过 JSON 文件导出、发送和导入。

## 本地打开

直接双击 `index.html` 即可使用。也可以在本目录启动任意静态网页服务器。

## 发布到 GitHub Pages

1. 登录 GitHub，点击右上角 `+` → **New repository**。
2. 仓库名称可填写 `hk-home-shortlist`，选择 **Public**，再创建仓库。
3. 点击 **uploading an existing file**，上传本文件夹中的 `index.html`、`styles.css`、`app.js` 和 `.nojekyll`，然后提交。
4. 打开仓库的 **Settings** → **Pages**。
5. 在 **Build and deployment** 下，将 Source 选为 **Deploy from a branch**；Branch 选 `main` 和 `/ (root)`，点击 **Save**。
6. 等待约 1–3 分钟。页面上会显示网址，通常为：`https://你的用户名.github.io/hk-home-shortlist/`。

## 家庭共享方式

- 网页公开后，家人都可打开，但每台设备的清单彼此独立。
- 一人整理后点击“导出清单”，把 `.json` 文件发到家庭群。
- 其他人打开网页，点击“导入清单”。已有资料时，可以选择替换或合并。
- 浏览器清理网站数据会删除本机清单，建议定期导出备份。

## 按揭估算

默认首付 30%、贷款 70%、年利率 3.5%、30 年等额本息。可在网页顶部的购房目标卡片中点击“调整参数”。估算不含印花税、代理佣金、律师费、按揭保险及装修费用，实际以银行估价和批核为准。
