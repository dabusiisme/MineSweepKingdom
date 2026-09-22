/**
 * BattleScene 战斗场景主控
 * 整合 BoardView + BattleHUD + ResultPopup
 */
import {
    _decorator, Component, Node, view, Layers, director,
    Sprite, Label, UITransform, UIOpacity, Color, tween, sys, game, Game, isValid,
} from "cc";
import { Board } from "../core/Board";
import { GameManager } from "../core/GameManager";
import { ClassicMode } from "../modes/ClassicMode";
import { BoardView } from "./BoardView";
import { BattleHUD } from "./BattleHUD";
import { ResultPopup } from "./ResultPopup";
import { AudioManager } from "../core/AudioManager";
import { TextureLibrary } from "./TextureLibrary";
import { starsFor } from "../data/Scoring";
import { HelpPanel } from "./HelpPanel";
import { fitPanelWidth } from "./UiLayout";
const { ccclass, property } = _decorator;

@ccclass("BattleScene")
export class BattleScene extends Component {
    @property(BoardView) boardView: BoardView | null = null;
    @property(BattleHUD) hud: BattleHUD | null = null;
    @property(ResultPopup) resultPopup: ResultPopup | null = null;
    private _mode: ClassicMode | null = null;
    private _startTime: number = 0;
    private _bg: Node | null = null;
    /** 暂停菜单（编辑器里搭好的，见 PausePanel） */
    private _pausePanel: Node | null = null;
    /** 特效层：撒花、红闪都画在这里 */
    private _fxLayer: Node | null = null;
    /** 开局前该难度的最好成绩（秒），用来判断这局是不是新纪录 */
    private _prevBestSec: number = Number.POSITIVE_INFINITY;

    /** 屏幕边距 */
    private static readonly MARGIN = 12;
    /** 状态栏与棋盘间距 */
    private static readonly GAP = 12;

    onLoad() {
        this._autoBind();
    }

    /**
     * start() 里有 await，玩家可能在资源加载完之前就切场景（例如从结算回主页）。
     * 等 await 醒过来时组件已经销毁，引擎的 _destruct() 会把对象类型字段全部置成 null，
     * 这时再往下跑就会读到空字段报错。每次 await 之后都要重新确认还活着。
     */
    private _alive(): boolean {
        return isValid(this, true) && !!this.node;
    }

    onEnable() {
        game.on(Game.EVENT_HIDE, this._onAppHide, this);
        game.on(Game.EVENT_SHOW, this._onAppShow, this);
    }

    onDisable() {
        game.off(Game.EVENT_HIDE, this._onAppHide, this);
        game.off(Game.EVENT_SHOW, this._onAppShow, this);
    }

    /** 切后台时把 BGM 停掉，别在后台继续响 */
    private _onAppHide(): void {
        AudioManager.setBgmSuspended(true);
        // 别让计时在后台偷跑：计分用的是 Date.now() 差值，切出去几分钟回来，
        // 这一局的用时会凭空多出几分钟，星级和战绩全都会错
        this.hud?.pauseIfRunning();
    }
    private _onAppShow(): void { AudioManager.setBgmSuspended(false); }

    private _autoBind(): void {
        const UI_2D = Layers.Enum.UI_2D;
        this.node.walk(n => { n.layer = UI_2D; });

        // 编辑器里这些实例有可能被拖到别的父节点下（例如 Camera），
        // 所以按整个场景查找，而不是只看 BattleRoot 的直接子节点。
        const scene = director.getScene();
        if (!this.hud) this.hud = this._findInScene(scene, BattleHUD);
        if (!this.resultPopup) this.resultPopup = this._findInScene(scene, ResultPopup);

        // 找到后统一挂回 BattleRoot，保证处于 Canvas 的 UI 空间内
        if (this.hud && this.hud.node.parent !== this.node) {
            this.hud.node.setParent(this.node);
        }
        if (this.resultPopup && this.resultPopup.node.parent !== this.node) {
            this.resultPopup.node.setParent(this.node);
        }
        if (this.hud) this.hud.node.walk(n => { n.layer = UI_2D; });
        if (this.resultPopup) this.resultPopup.node.walk(n => { n.layer = UI_2D; });

        // 暂停菜单
        this._pausePanel = this.node.getChildByName("PausePanel");
        if (this._pausePanel) {
            this._pausePanel.walk(n => { n.layer = UI_2D; });
            this._pausePanel.active = false;
        }

        // 棋盘的交互回调只在场景加载时注册一次。
        // BoardView 节点在整个场景生命周期里都存在（重开一局只是重建格子），
        // 放在 _startGame 里注册的话每重开一次就会多挂一层监听。
        if (this.boardView) {
            this.boardView.node.on("board.reveal", (e: any) => this._onCellReveal(e), this);
            this.boardView.node.on("board.flag", (e: any) => this._onCellFlag(e), this);
            this.boardView.node.on("board.chord", (e: any) => this._onCellChord(e), this);
        }
    }

    private _findInScene(scene: Node | null, ctor: any): any {
        return scene ? scene.getComponentInChildren(ctor) : null;
    }

    /**
     * 取屏幕安全区的上下内缩（设计分辨率单位）。
     * sys.getSafeAreaRect() 返回的是 UI 坐标系（原点在可见区左下角）里的矩形，
     * 而我们给节点定位用的是以画面中心为原点的坐标，所以要先换算一下。
     * 非异形屏会返回整块可见区，算出来就是 0。
     */
    private _safeInsets(visibleHeight: number): { top: number; bottom: number } {
        try {
            const r = sys.getSafeAreaRect();
            const top = visibleHeight - (r.y + r.height);
            const bottom = r.y;
            return { top: Math.max(0, top), bottom: Math.max(0, bottom) };
        } catch (e) {
            // 个别平台没实现这个接口，退回整屏
            console.warn("[BattleScene] 取安全区失败，按整屏处理:", e);
            return { top: 0, bottom: 0 };
        }
    }

    /** 铺满屏幕的柔和渐变底色，顺便承载暂停遮罩 */
    private _ensureBackdrop(): void {
        if (!this._bg) {
            const bg = new Node("Backdrop");
            bg.layer = Layers.Enum.UI_2D;
            bg.addComponent(UITransform);
            const sprite = bg.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            bg.parent = this.node;
            this._bg = bg;
        }
        // 暂停菜单现在是场景里搭好的 PausePanel，不再运行时建节点

        // 特效层：放在棋盘之上、状态栏之下，撒花和红闪都画在这里
        if (!this._fxLayer || !isValid(this._fxLayer)) {
            const fx = new Node("FxLayer");
            fx.layer = Layers.Enum.UI_2D;
            fx.addComponent(UITransform);
            fx.parent = this.node;
            this._fxLayer = fx;
        }
    }

    async start() {
        // 贴图必须先就位，否则格子会先闪一下纯色。
        // 注意这里只等贴图——之前把音频也一起等了，而音频根本不参与渲染，
        // 等于让棋盘白等 8 个音频资源的加载时间。
        await TextureLibrary.load();
        if (!this._alive()) return;

        // 先把背景和棋盘画出来
        this._ensureBackdrop();
        // 暂停菜单的按钮同样是 MCP 直接赋的 spriteFrame，补一道九宫格
        TextureLibrary.reskinTree(this._pausePanel);
        fitPanelWidth(this._pausePanel);
        // 难度由难度选择页通过 GameManager.pendingDifficultyId 带进来
        this._startGame(GameManager.pendingDifficultyId || "medium");

        // 音频放后台加载，加载完再起 BGM，不挡住首屏
        AudioManager.load()
            .then(() => {
                if (!this._alive()) return;
                AudioManager.playBGM();
            })
            .catch((e) => console.warn("[BattleScene] 音频加载失败，本局静音:", e));

        // 第一次进战斗自动弹一次玩法说明，看过就不再弹（主页面还能随时打开）
        if (!HelpPanel.tutorialDone) {
            const help = this.node.getComponentInChildren(HelpPanel);
            // 标记为"看过"放在玩家点关闭的时候（见 HelpPanel.onCloseClicked）
            if (help) help.show();
            else console.warn("[BattleScene] 找不到 HelpPanel，首次引导没弹出来");
        }
    }

    public _startGame(difficultyId: string): void {
        this._mode = new ClassicMode();
        const board = this._mode.start(difficultyId);
        this._startTime = Date.now();
        // 先记下开局前的最好成绩，通关时用它判断是不是新纪录。
        // 不能等结束后再读——GameManager 的存档回调在 GAME_WIN 时先跑，那时纪录已经被刷掉了。
        this._prevBestSec = this._bestSeconds(difficultyId);

        // ---- 分辨率自适应布局 ----
        // 用可见区域（而不是 windowSize）计算，才能和设计分辨率 + 适配策略对齐
        const visible = view.getVisibleSize();
        const MARGIN = BattleScene.MARGIN;
        const BAR_H = BattleHUD.BAR_H;
        const GAP = BattleScene.GAP;
        // 刘海屏 /home 指示条的安全区内缩，非异形屏是 0
        const safe = this._safeInsets(visible.height);

        // 状态栏贴着安全区顶部，避开刘海
        const hudY = visible.height / 2 - MARGIN - safe.top - BAR_H / 2;
        const barW = visible.width - MARGIN * 2;
        if (this.hud) {
            this.hud.node.active = true;
            this.hud.layout(barW);
            this.hud.node.setPosition(0, hudY, 0);
        }

        // 棋盘紧贴状态栏下方，占据剩余空间
        const boardTopY = hudY - BAR_H / 2 - GAP;
        const boardBottomY = -visible.height / 2 + MARGIN + safe.bottom;
        const boardAreaH = Math.max(120, boardTopY - boardBottomY);
        this.boardView?.initBoard(board, barW, boardAreaH);
        if (this.boardView) {
            // 在状态栏以下的可用区里居中。
            // 新的竖版棋盘基本会铺满（中等/困难/地狱都到 95%+），居中和贴上沿几乎没差别；
            // 简单档因为格子有 60 的上限、铺不满，居中才不会把空白全堆在底部。
            this.boardView.node.setPosition(0, (boardTopY + boardBottomY) / 2, 0);
        }

        // 弹窗居中
        if (this.resultPopup) {
            this.resultPopup.node.setPosition(0, 0, 0);
            // 开局先把弹窗藏起来（onLoad 里不能做这件事，见 ResultPopup 注释）
            this.resultPopup.hide();
        }

        // 背景铺满可见区域，暂停菜单的遮罩同样铺满
        this._layoutBackdrop(visible.width, visible.height);
        this._setPaused(false);

        // 明确绘制顺序：背景 → 棋盘 → 状态栏 → 结算弹窗 → 暂停菜单 → 玩法说明
        if (this._bg) this._bg.setSiblingIndex(0);
        if (this.boardView) this.boardView.node.setSiblingIndex(1);
        if (this._fxLayer) this._fxLayer.setSiblingIndex(2);
        if (this.hud) this.hud.node.setSiblingIndex(3);
        if (this.resultPopup) this.resultPopup.node.setSiblingIndex(4);
        if (this._pausePanel) this._pausePanel.setSiblingIndex(5);
        const help = this.node.getComponentInChildren(HelpPanel);
        if (help) help.node.setSiblingIndex(6);

        // HUD setup
        if (this.hud) {
            this.hud.updateMineCount(board.mineCount, 0);
            this.hud.startTimer();
            this.hud.onPause = (paused: boolean) => this._setPaused(paused);
            this.hud.onRestart = () => this._restart();
        }

        // Game end events
        // 注意：这里**不能**写 eventTarget.off("game.win")。
        // 不传回调的 off(type) 会把该事件上的**所有**监听器删掉，包括
        // GameManager.startGame() 里注册的存档回调——那样每局结束都不会写战绩。
        // 而且这里也不需要清理：每次 _startGame 都 new 了一个 Board，EventTarget 是全新的。
        board.eventTarget.on("game.win", () => this._onGameWin(), this);
        board.eventTarget.on("game.over", () => this._onGameOver(), this);

        // ResultPopup callbacks
        if (this.resultPopup) {
            this.resultPopup.onRetry = () => this._restart();
            // 结算后可以回主页面（M2 T2.3.2 的最小闭环）
            this.resultPopup.onHome = () => {
                director.loadScene("HomeScene");
            };
            // 战绩面板在 HomeScene 里，先回主页再让那边自动打开
            this.resultPopup.onStats = () => {
                GameManager.pendingOpenPanel = "stats";
                director.loadScene("HomeScene");
            };
        }
    }

    private _getElapsed(): number {
        // 优先用 HUD 的计时（会自动扣掉暂停时长）
        if (this.hud) return this.hud.getElapsedSeconds();
        return Math.floor((Date.now() - this._startTime) / 1000);
    }

    /** 该难度下已通关的最快用时（秒）；没有记录返回 Infinity */
    private _bestSeconds(difficultyId: string): number {
        let best = Number.POSITIVE_INFINITY;
        try {
            for (const h of GameManager.instance.getHistory(difficultyId) as any[]) {
                if (h?.win && typeof h.duration === "number" && h.duration < best) best = h.duration;
            }
        } catch (e) {
            console.warn("[BattleScene] 读取最佳成绩失败，按无记录处理:", e);
        }
        return best;
    }

    // ---------- 结算表现 ----------

    /**
     * 胜利撒花。
     * 没用粒子系统（要额外的 plist 资源），改用一批小色块 + 缓动下落，
     * 颜色取项目色板，和整体治愈风格统一。
     */
    private _playVictoryFx(): void {
        const layer = this._fxLayer;
        if (!layer) return;
        const visible = view.getVisibleSize();
        const COLORS = [
            new Color(184, 230, 210, 255),   // 薄荷
            new Color(255, 214, 224, 255),   // 樱花
            new Color(255, 241, 182, 255),   // 奶油
            new Color(199, 226, 244, 255),   // 雾蓝
            new Color(224, 212, 247, 255),   // 薰衣草
        ];
        const COUNT = 26;

        // 用一个「进度驱动对象」统一更新所有彩带，而不是给每个节点各挂一条 position 补间。
        // 这样既不依赖 tween 对 Vec3 属性的处理，26 个节点也只有一条补间在跑。
        const items: Array<{
            node: Node; opacity: UIOpacity;
            x0: number; y0: number; x1: number; y1: number;
            a0: number; a1: number; delay: number; dur: number;
        }> = [];

        for (let i = 0; i < COUNT; i++) {
            const node = new Node("Confetti");
            node.layer = Layers.Enum.UI_2D;
            const tf = node.addComponent(UITransform);
            tf.setContentSize(16, 24);
            const sp = node.addComponent(Sprite);
            sp.sizeMode = Sprite.SizeMode.CUSTOM;
            TextureLibrary.apply(sp, "white", 16, 24);
            sp.color = COLORS[i % COLORS.length];
            node.parent = layer;

            const startX = (Math.random() - 0.5) * visible.width;
            const startY = visible.height / 2 + 40;
            const drift = (Math.random() - 0.5) * 140;
            const fall = visible.height + 100;
            const dur = 1.8 + Math.random() * 1.0;
            const delay = Math.random() * 0.5;
            const a0 = Math.random() * 360;
            node.setPosition(startX, startY, 0);
            node.angle = a0;

            const opacity = node.addComponent(UIOpacity);
            items.push({
                node, opacity,
                x0: startX, y0: startY,
                x1: startX + drift, y1: startY - fall,
                a0, a1: a0 + 540 + Math.random() * 360,
                delay, dur,
            });
        }

        const total = Math.max(...items.map((it) => it.delay + it.dur));
        const driver = { t: 0 };
        tween(driver)
            .to(total, { t: 1 }, {
                easing: "linear",
                onUpdate: () => {
                    const now = driver.t * total;
                    for (const it of items) {
                        if (!isValid(it.node)) continue;
                        const raw = (now - it.delay) / it.dur;
                        if (raw <= 0) continue;
                        const p = Math.min(1, raw);
                        // 竖直方向用缓入模拟重力，横向线性漂移
                        const e = p * p * 0.6 + p * 0.4;
                        it.node.setPosition(
                            it.x0 + (it.x1 - it.x0) * p,
                            it.y0 + (it.y1 - it.y0) * e, 0);
                        it.node.angle = it.a0 + (it.a1 - it.a0) * p;
                        // 快落地时淡出，避免"啪"地一下消失
                        const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
                        it.opacity.opacity = Math.max(0, Math.round(255 * fade));
                    }
                },
            })
            .call(() => {
                for (const it of items) if (isValid(it.node)) it.node.destroy();
            })
            .start();
    }

    /**
     * 失败表现：一层红闪 + 棋盘横向震一下。
     * 没做真正的慢镜头——那要动 timeScale，会影响计时和输入，得不偿失。
     */
    private _playDefeatFx(): void {
        const layer = this._fxLayer;
        if (!layer) return;
        const visible = view.getVisibleSize();

        const flash = new Node("DefeatFlash");
        flash.layer = Layers.Enum.UI_2D;
        const tf = flash.addComponent(UITransform);
        tf.setContentSize(visible.width, visible.height);
        const sp = flash.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        TextureLibrary.apply(sp, "white", visible.width, visible.height);
        sp.color = new Color(214, 90, 90, 255);
        const opacity = flash.addComponent(UIOpacity);
        opacity.opacity = 0;
        flash.parent = layer;
        tween(opacity)
            .to(0.10, { opacity: 115 })
            .to(0.45, { opacity: 0 })
            .call(() => { if (isValid(flash)) flash.destroy(); })
            .start();

        // 棋盘震一下；基准位置每次开局都会重设，不怕残留偏移
        const board = this.boardView?.node;
        if (board) {
            const base = board.position.clone();
            // 同样用一个驱动对象 + onUpdate 改位置，避免直接对节点做 position 补间
            const shake = { t: 0 };
            tween(shake)
                .to(0.26, { t: 1 }, {
                    easing: "linear",
                    onUpdate: () => {
                        if (!isValid(board)) return;
                        const k = shake.t;
                        const amp = 12 * (1 - k);          // 振幅递减
                        const dx = Math.sin(k * Math.PI * 6) * amp;
                        board.setPosition(base.x + dx, base.y, 0);
                    },
                })
                .call(() => { if (isValid(board)) board.setPosition(base); })
                .start();
        }
    }

    private _layoutBackdrop(w: number, h: number): void {
        if (this._bg) {
            const tf = this._bg.getComponent(UITransform);
            if (tf) tf.setContentSize(w, h);
            const sprite = this._bg.getComponent(Sprite);
            if (sprite) {
                if (!TextureLibrary.apply(sprite, "background", w, h)) {
                    sprite.color = new Color(226, 237, 250, 255);
                }
            }
        }
        if (this._pausePanel) {
            const tf = this._pausePanel.getChildByName("Mask")?.getComponent(UITransform);
            if (tf) tf.setContentSize(w, h);
        }
    }

    private _setPaused(paused: boolean): void {
        if (this._pausePanel) {
            this._pausePanel.active = paused;
            if (paused) {
                this._refreshPauseInfo();
                this._refreshSoundBtn();
            }
        }
        this.boardView?.setInputEnabled(!paused);
    }

    // ---------- 暂停菜单 ----------

    /** 当前局信息：难度 · 用时 · 剩余雷数 */
    private _refreshPauseInfo(): void {
        const label = this._pausePanel?.getChildByName("InfoLabel")?.getComponent(Label);
        if (!label || !this.hud || !this._mode?.board) return;
        const board = this._mode.board;
        const sec = this.hud.getElapsedSeconds();
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        label.string = `${this._mode.difficulty?.name ?? ""} · ${m}:${s < 10 ? "0" : ""}${s} · 剩余 ${board.getRemainingMines()} 雷`;
    }

    /** 音效开关按钮的文字跟着当前状态走 */
    private _refreshSoundBtn(): void {
        const label = this._pausePanel?.getChildByName("BtnSound")?.getChildByName("Label")?.getComponent(Label);
        if (label) label.string = AudioManager.muted ? "音效：关" : "音效：开";
    }

    onResumeClicked(): void {
        AudioManager.play("click");
        this.hud?.resumeIfPaused();
    }

    onPauseRestartClicked(): void {
        AudioManager.play("click");
        this._setPaused(false);
        this._restart();
    }

    onBackHomeClicked(): void {
        AudioManager.play("click");
        director.loadScene("HomeScene");
    }

    onSoundClicked(): void {
        AudioManager.setMuted(!AudioManager.muted);
        AudioManager.play("click");
        this._refreshSoundBtn();
    }

    private _onCellReveal(event: any): void {
        const { row, col } = event;
        if (this._mode) this._mode.reveal(row, col);
        this.boardView?.updateAllCells();
        if (this.hud && this._mode && this._mode.board) {
            this.hud.updateMineCount(this._mode.board.getRemainingMines(), this._mode.board.getFlaggedCount());
        }
        AudioManager.play('reveal');
    }

    private _onCellFlag(event: any): void {
        const { row, col } = event;
        if (this._mode) {
            const cell = this._mode.board?.getCell(row, col);
            this._mode.toggleFlag(row, col);
            AudioManager.play(cell?.isFlagged() ? 'flag' : 'unflag');
        }
        this.boardView?.updateAllCells();
        if (this.hud && this._mode && this._mode.board) {
            this.hud.updateMineCount(this._mode.board.getRemainingMines(), this._mode.board.getFlaggedCount());
        }
    }

    private _onCellChord(event: any): void {
        const { row, col } = event;
        if (this._mode) this._mode.chord(row, col);
        this.boardView?.updateAllCells();
        AudioManager.play('chord');
    }

    private _onGameWin(): void {
        if (this.hud) this.hud.stopTimer();
        AudioManager.play('win');
        // 特效再花哨也只是锦上添花，绝不能因为它出错就吞掉结算弹窗
        try { this._playVictoryFx(); } catch (e) { console.warn("[BattleScene] 撒花特效出错，已跳过:", e); }
        if (this.resultPopup && this._mode && this._mode.board) {
            const duration = this._getElapsed();
            const isRecord = duration < this._prevBestSec;
            this.resultPopup.show(true, duration, this._mode.difficulty?.name || "",
                this._mode.board.getFlaggedCount(), starsFor(this._mode.difficulty, duration), isRecord);
        }
    }

    private _onGameOver(): void {
        if (this.hud) this.hud.stopTimer();
        AudioManager.play('explosion');
        try { this._playDefeatFx(); } catch (e) { console.warn("[BattleScene] 失败特效出错，已跳过:", e); }
        if (this.resultPopup && this._mode && this._mode.board) {
            const duration = this._getElapsed();
            this.resultPopup.show(false, duration, this._mode.difficulty?.name || "",
                this._mode.board.getFlaggedCount(), 0);
        }
    }

    private _restart(): void { if (this._mode) this._startGame(this._mode.difficulty?.id || "medium"); }
}
