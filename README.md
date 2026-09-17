# 扫雷大王 · MineSweep Kingdom

一款用 Cocos Creator 做的经典扫雷游戏，保留国际通用规则，走轻柔治愈的视觉风格。
目前完成的是**单机经典模式**，从布雷、翻格、插旗到结算，整条主流程已经可以完整跑通。

---

## 技术栈

| 项 | 说明 |
| --- | --- |
| 引擎 | Cocos Creator 3.8.8 |
| 语言 | TypeScript |
| 设计分辨率 | 750 × 1334（适配屏幕高度） |
| 目标平台 | Web（H5）/ 小游戏 |

---

## 玩法特性

**难度档位**

| 档位 | 棋盘 | 雷数 |
| --- | --- | --- |
| 简单 | 9 × 9 | 10 |
| 中等（默认） | 16 × 16 | 40 |
| 困难 | 16 × 30 | 99 |
| 地狱 | 30 × 30 | 200 |

**操作方式**

| 操作 | 行为 |
| --- | --- |
| 轻点 | 翻开格子 |
| 长按 0.5 秒 | 插旗 / 取消插旗 |
| 双击已翻开的数字 | 周围旗数与数字相符时，一键展开（chord） |

**已实现**

- 首格安全布雷：第一次翻开的位置及其周围 8 格保证无雷
- BFS 自动展开：翻到空格时连锁展开相连区域
- 顶部状态栏：计时器、剩余雷数、插旗数、暂停/继续、重新开始
- 暂停后可继续，暂停时长不计入成绩
- 结算弹窗：胜利 1~3 星、用时、难度、插旗数，可再来一局
- 音效：翻格、插旗、取消旗、chord、胜利、踩雷爆炸
- 战绩写入浏览器本地存储（每个难度保留最近 50 局）

---

## 目录结构

```
MineSweepKingdom/
├── assets/
│   ├── scenes/
│   │   └── BattleScene.scene          # 主战斗场景
│   ├── prefabs/
│   │   ├── CellPrefab.prefab          # 单个格子
│   │   ├── HUDPrefab.prefab           # 顶部状态栏
│   │   └── ResultPopupPrefab.prefab   # 结算弹窗
│   ├── resources/
│   │   ├── textures/                  # 预生成的 PNG 素材
│   │   ├── audio/                     # 预生成的 wav 音效
│   │   └── placeholders/white.png     # 纯白占位图
│   └── scripts/
│       ├── core/
│       │   ├── Cell.ts                # 格子（状态机）
│       │   ├── MineGenerator.ts       # 布雷算法（首格安全）
│       │   ├── Board.ts               # 棋盘：BFS 展开 / chord / 胜负判定
│       │   ├── GameManager.ts         # 全局单例：跨场景数据 + 存档
│       │   └── AudioManager.ts        # 音效管理
│       ├── data/
│       │   ├── types.ts               # 全局类型与事件常量
│       │   └── ConfigLoader.ts        # 难度配置 + 配色
│       ├── modes/
│       │   └── ClassicMode.ts         # 经典模式
│       └── ui/
│           ├── BattleScene.ts         # 场景主控与布局
│           ├── BoardView.ts           # 棋盘视图与交互转发
│           ├── CellView.ts            # 格子视图与触摸手势
│           ├── BattleHUD.ts           # 状态栏
│           ├── ResultPopup.ts         # 结算弹窗
│           └── TextureLibrary.ts      # 素材加载与上屏
├── extensions/cocos-mcp-server/       # 编辑器自动化插件（本地开发用，未纳入版本管理）
├── tools/                             # 素材生成脚本
└── settings/                          # 项目设置
```

---

## 分层设计

逻辑层和视图层是分开的。棋盘规则部分（`Board` / `Cell` / `MineGenerator`）不依赖场景和节点树，
只靠 `EventTarget` 对外发消息，可以脱离 UI 单独跑；`ui/` 负责把状态画出来，
并把触摸手势翻译成对 `Board` 的调用。

两者之间通过 `Board.eventTarget` 上的事件通信（`cell.revealed`、`cell.flagged`、`mine.triggered`、
`board.cleared`、`game.win`、`game.over`）。

---

## 运行方式

1. 用 Cocos Dashboard 打开本项目目录
2. 打开 `assets/scenes/BattleScene.scene`
3. 点击编辑器右上角的预览按钮

默认以「中等」难度开局，清空浏览器本地存储可以重置战绩。

---

## 实现说明

### 素材

美术和音效都是**预先生成好**的普通资源文件，放在 `assets/resources/` 下，运行时用
`resources.load` 加载，不依赖任何浏览器 API：

| 目录 | 内容 |
| --- | --- |
| `textures/` | 格子凸起/凹陷、旗子、地雷、星星、状态栏、结算面板、按钮三态、背景，共 11 张 PNG |
| `audio/` | 翻格、插旗、取消旗、chord、胜利、爆炸、按钮点击，共 7 个 wav |

格子和状态栏、按钮用的是**九宫格拉伸**（`Sprite.Type.SLICED`），所以同一张图能适配
不同尺寸的格子和小屏宽，边角不会糊掉。

素材缺失时不会崩：`TextureLibrary` 会自动回退成纯色方块，`AudioManager` 静默跳过，
游戏照样能玩。

### 重新生成素材

素材是脚本生成的，想调配色或尺寸不用手改图片：

```bash
node tools/gen-textures.js   # 重新生成 PNG（需要本机装了 Chrome）
node tools/gen-audio.js      # 重新生成 wav（纯 Node，无依赖）
```

绘制逻辑写在 `tools/texture-draw.html` 里，音色定义写在 `tools/gen-audio.js` 的
`SOUNDS` 里。
