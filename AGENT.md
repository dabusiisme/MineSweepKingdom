# AGENTS.md

## 项目约定
- 固定 UI（背景、按钮、弹窗）在编辑器 Scene/Prefab 里拖，禁止 TS 里 `new Node` 搭固定界面
- 动态元素（列表、子弹、飘字）用 Prefab + `instantiate` + NodePool
- 脚本放 `assets/scripts/`，按功能分子目录
- 动态加载资源统一放 `assets/resources/`，用完 `decRef` / `release`

## 硬规则
- 绝不手写/修改 `.scene` / `.prefab` / `.meta` 文件内容
- 新建节点必须挂到已有父节点（Canvas / GameRoot），不挂场景根
- Sprite 组件必须赋值 SpriteFrame，不留空引用
- 不使用浏览器 DOM / BOM API（无 `window`、`document`）
- 节点销毁时同步 `off` 事件、清除定时器、释放动态资源

## 协作约定
- 改节点结构前先调 MCP `get_hierarchy` 确认现状
- 改完后说明改了哪个节点及其 uuid
- 逻辑变更需说明验证方式（编辑器预览 / 静态推理）