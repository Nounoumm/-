# 课程讲义工坊网站

## 本地运行

在仓库根目录安装网站依赖后运行：

```text
npm --prefix site install
npm --prefix site run dev
```

服务端默认监听 `http://127.0.0.1:4173`，Vite 开发页面监听 `http://127.0.0.1:5173`。

生产环境需要 Node.js 22.5+（社区 SQLite 使用内置 `node:sqlite`），并设置 `DEEPSEEK_API_KEY`；可用 `PYTHON_PATH` 指定 Python 3.12，可用 `PORT` 设置服务端端口。没有密钥时页面仍可打开，但生成请求会返回配置错误。社区数据保存在 `DATABASE_PATH` 指定的 SQLite 文件，生产环境需要持久化磁盘；管理员审核接口使用 `ADMIN_API_KEY`。
