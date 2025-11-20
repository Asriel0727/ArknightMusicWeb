# GitHub Pages 部署指南

## 部署步骤

### 1. 准备 GitHub 仓库

1. 在 GitHub 上创建一个新仓库（或使用现有仓库）
2. 将代码推送到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/你的用户名/你的仓库名.git
   git push -u origin main
   ```

### 2. 配置 GitHub Pages

1. 进入你的 GitHub 仓库
2. 点击 **Settings**（设置）
3. 在左侧菜单中找到 **Pages**（页面）
4. 在 **Source**（源）部分：
   - 选择 **GitHub Actions** 作为部署源
   - 保存设置

### 3. 修改 Vite 配置（重要！）

根据你的 GitHub 仓库名，需要修改 `vite.config.js` 中的 `base` 路径：

- **如果仓库名是 `你的用户名.github.io`**：
  ```js
  base: process.env.NODE_ENV === 'production' ? '/' : '/',
  ```

- **如果仓库名是其他名称**（例如：`MonsterSirenWebpage`）：
  ```js
  base: process.env.NODE_ENV === 'production' ? '/MonsterSirenWebpage/' : '/',
  ```
  
  ⚠️ **注意**：base 路径必须与你的仓库名完全匹配（包括大小写）

### 4. 自动部署

配置完成后，每次你推送代码到 `main` 分支时，GitHub Actions 会自动：
1. 安装依赖
2. 构建项目（`npm run build`）
3. 部署到 GitHub Pages

### 5. 查看部署状态

1. 在仓库页面点击 **Actions** 标签
2. 查看工作流运行状态
3. 部署成功后，在 **Settings > Pages** 中可以看到你的网站 URL

## 手动构建（可选）

如果你想在本地先测试构建：

```bash
cd MonsterSirenWebpage-main
npm install
npm run build
npm run preview  # 预览构建结果
```

构建后的文件会在 `dist` 文件夹中。

## 常见问题

### 页面显示 404 或空白

- 检查 `vite.config.js` 中的 `base` 路径是否正确
- 确保 base 路径与仓库名匹配（包括大小写）

### 资源文件加载失败

- 检查所有资源路径是否使用相对路径
- 确认 `base` 配置正确

### GitHub Actions 失败

- 检查工作流文件中的分支名是否正确（main 或 master）
- 确保 `package.json` 中的构建脚本正确

