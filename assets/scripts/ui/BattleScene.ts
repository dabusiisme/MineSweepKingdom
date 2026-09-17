/**
 * BattleScene 战斗场景主控
 * 整合 BoardView + BattleHUD + ResultPopup
 */
import {
    _decorator, Component, Node, view, Layers, director,
    Sprite, Label, UITransform, UIOpacity, Color,
} from "cc";
import { Board } from "../core/Board";
import { GameManager } from "../core/GameManager";
import { ClassicMode } from "../modes/ClassicMode";
import { BoardView } from "./BoardView";
import { BattleHUD } from "./BattleHUD";
import { ResultPopup } from "./ResultPopup";
import { AudioManager } from "../core/AudioManager";
import { TextureFactory } from "./TextureFactory";
const { ccclass, property } = _decorator;

@ccclass("BattleScene")
export class BattleScene extends Component {
    @property(BoardView) boardView: BoardView | null = null;
    @property(BattleHUD) hud: BattleHUD | null = null;
    @property(ResultPopup) resultPopup: ResultPopup | null = null;
    private _mode: ClassicMode | null = null;
    private _startTime: number = 0;
    private _bg: Node | null = null;
    private _pauseMask: Node | null = null;

    /** 顶部状态栏高度（设计像素） */
    private static readonly BAR_H = 80;
    /** 屏幕边距 */
    private static readonly MARGIN = 12;
    /** 状态栏与棋盘间距 */
    private static readonly GAP = 12;

    onLoad() {
        this._autoBind();
    }

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

        this._ensureBackdrop();
    }

    private _findInScene(scene: Node | null, ctor: any): any {
        return scene ? scene.getComponentInChildren(ctor) : null;
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
        if (!this._pauseMask) {
            const mask = new Node("PauseMask");
            mask.layer = Layers.Enum.UI_2D;
            mask.addComponent(UITransform);
            const sprite = mask.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.color = new Color(232, 240, 250, 210);
            const opacity = mask.addComponent(UIOpacity);
            opacity.opacity = 255;

            const hint = new Node("PauseHint");
            hint.layer = Layers.Enum.UI_2D;
            hint.parent = mask;
            hint.addComponent(UITransform);
            const label = hint.addComponent(Label);
            label.string = "⏸️  已暂停";
            label.fontSize = 48;
            label.lineHeight = 60;
            label.color = new Color(58, 58, 74, 255);
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.CENTER;

            mask.parent = this.node;
            mask.active = false;
            this._pauseMask = mask;
        }
    }

    start() { this._startGame("medium"); }

    public _startGame(difficultyId: string): void {
        this._mode = new ClassicMode();
        const board = this._mode.start(difficultyId);
        this._startTime = Date.now();

        // ---- 分辨率自适应布局 ----
        // 用可见区域（而不是 windowSize）计算，才能和设计分辨率 + 适配策略对齐
        const visible = view.getVisibleSize();
        const MARGIN = BattleScene.MARGIN;
        const BAR_H = BattleScene.BAR_H;
        const GAP = BattleScene.GAP;

        // 状态栏贴屏幕顶部
        const hudY = visible.height / 2 - MARGIN - BAR_H / 2;
        const barW = visible.width - MARGIN * 2;
        if (this.hud) {
            this.hud.node.active = true;
            this.hud.layout(barW);
            this.hud.node.setPosition(0, hudY, 0);
        }

        // 棋盘紧贴状态栏下方，占据剩余空间
        const boardTopY = hudY - BAR_H / 2 - GAP;
        const boardBottomY = -visible.height / 2 + MARGIN;
        const boardAreaH = Math.max(120, boardTopY - boardBottomY);
        this.boardView?.initBoard(board, barW, boardAreaH);
        if (this.boardView) {
            // 让棋盘上边缘贴着状态栏下边缘
            this.boardView.node.setPosition(0, boardTopY - this.boardView.boardPixelHeight / 2, 0);
        }

        // 弹窗居中
        if (this.resultPopup) {
            this.resultPopup.node.setPosition(0, 0, 0);
            // 开局先把弹窗藏起来（onLoad 里不能做这件事，见 ResultPopup 注释）
            this.resultPopup.hide();
        }

        // 背景铺满可见区域，暂停遮罩同样铺满
        this._layoutBackdrop(visible.width, visible.height);
        this._setPaused(false);

        // 明确绘制顺序：背景 → 棋盘 → 暂停遮罩 → 状态栏 → 弹窗
        if (this._bg) this._bg.setSiblingIndex(0);
        if (this.boardView) this.boardView.node.setSiblingIndex(1);
        if (this._pauseMask) this._pauseMask.setSiblingIndex(2);
        if (this.hud) this.hud.node.setSiblingIndex(3);
        if (this.resultPopup) this.resultPopup.node.setSiblingIndex(4);

        // Board events
        this.boardView?.node.off("board.reveal");
        this.boardView?.node.off("board.flag");
        this.boardView?.node.off("board.chord");
        this.boardView?.node.on("board.reveal", (e: any) => this._onCellReveal(e), this);
        this.boardView?.node.on("board.flag", (e: any) => this._onCellFlag(e), this);
        this.boardView?.node.on("board.chord", (e: any) => this._onCellChord(e), this);

        // HUD setup
        if (this.hud) {
            this.hud.updateMineCount(board.mineCount, 0);
            this.hud.startTimer();
            this.hud.onPause = (paused: boolean) => this._setPaused(paused);
            this.hud.onRestart = () => this._restart();
        }

        // Game end events
        board.eventTarget.off("game.win");
        board.eventTarget.off("game.over");
        board.eventTarget.on("game.win", () => this._onGameWin(), this);
        board.eventTarget.on("game.over", () => this._onGameOver(), this);

        // ResultPopup callbacks
        if (this.resultPopup) {
            this.resultPopup.onRetry = () => this._restart();
        }
    }

    private _getElapsed(): number {
        // 优先用 HUD 的计时（会自动扣掉暂停时长）
        if (this.hud) return this.hud.getElapsedSeconds();
        return Math.floor((Date.now() - this._startTime) / 1000);
    }

    private _layoutBackdrop(w: number, h: number): void {
        if (this._bg) {
            const tf = this._bg.getComponent(UITransform);
            if (tf) tf.setContentSize(w, h);
            const sprite = this._bg.getComponent(Sprite);
            if (sprite) {
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                const sf = TextureFactory.background(w, h);
                if (sf) {
                    sprite.spriteFrame = sf;
                    sprite.color = new Color(255, 255, 255, 255);
                } else {
                    sprite.color = new Color(226, 237, 250, 255);
                }
            }
        }
        if (this._pauseMask) {
            const tf = this._pauseMask.getComponent(UITransform);
            if (tf) tf.setContentSize(w, h);
        }
    }

    private _setPaused(paused: boolean): void {
        if (this._pauseMask) this._pauseMask.active = paused;
        this.boardView?.setInputEnabled(!paused);
    }

    private _onCellReveal(event: any): void {
        const { row, col } = event;
        if (this._mode) this._mode.reveal(row, col);
        this.boardView?.updateAllCells();
        if (this.hud && this._mode && this._mode.board) {
            this.hud.updateMineCount(this._mode.board.getRemainingMines(), this._mode.board.getFlaggedCount());
        }
        AudioManager.instance.play('reveal');
    }

    private _onCellFlag(event: any): void {
        const { row, col } = event;
        if (this._mode) {
            const cell = this._mode.board?.getCell(row, col);
            this._mode.toggleFlag(row, col);
            AudioManager.instance.play(cell?.isFlagged() ? 'flag' : 'unflag');
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
        AudioManager.instance.play('chord');
    }

    private _onGameWin(): void {
        if (this.hud) this.hud.stopTimer();
        AudioManager.instance.play('win');
        if (this.resultPopup && this._mode && this._mode.board) {
            const duration = this._getElapsed();
            this.resultPopup.show(true, duration, this._mode.difficulty?.name || "", this._mode.board.getFlaggedCount());
        }
    }

    private _onGameOver(): void {
        if (this.hud) this.hud.stopTimer();
        AudioManager.instance.play('explosion');
        if (this.resultPopup && this._mode && this._mode.board) {
            const duration = this._getElapsed();
            this.resultPopup.show(false, duration, this._mode.difficulty?.name || "", this._mode.board.getFlaggedCount());
        }
    }

    private _restart(): void { if (this._mode) this._startGame(this._mode.difficulty?.id || "medium"); }
}
