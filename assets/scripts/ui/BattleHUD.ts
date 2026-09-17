/**
 * BattleHUD 战斗 HUD
 * 顶部状态条：倒计时 | 剩余雷数 | 暂停按钮
 */
import { _decorator, Component, Node, Label, Sprite, Color, Layers, UITransform } from "cc";
import { TextureFactory } from "./TextureFactory";
const { ccclass, property } = _decorator;

@ccclass("BattleHUD")
export class BattleHUD extends Component {
    @property(Label) timerLabel: Label | null = null;
    @property(Label) mineCountLabel: Label | null = null;
    @property(Label) flagCountLabel: Label | null = null;
    @property(Node) pauseBtn: Node | null = null;
    @property(Node) restartBtn: Node | null = null;
    private _startTime: number = 0;
    private _isPaused: boolean = false;
    private _running: boolean = false;
    private _pausedTotal: number = 0;
    private _pauseStartedAt: number = 0;
    private _lastElapsed: number = 0;
    /** 暂停按钮在栏内的横向位置，切换图标时要复用 */
    private _pauseLayoutX: number = Number.NaN;
    public onPause?: (paused: boolean) => void;
    public onRestart?: () => void;

    /** 状态栏高度 */
    private static readonly BAR_H = 80;
    /** 按钮尺寸 */
    private static readonly BTN = 64;
    /** 标签字号 */
    private static readonly FONT = 28;

    onLoad() {
        this._fixLayer();
        this._reset();
    }

    /**
     * 按给定宽度重新排布状态栏。
     * 编辑器里摆的位置会被这里覆盖，所以改位置要改这个函数。
     */
    public layout(barWidth: number): void {
        const w = Math.max(200, barWidth);
        const half = w / 2;

        // 背景条铺满
        const barBG = this.node.getChildByName('BarBG');
        if (barBG) {
            const tf = barBG.getComponent(UITransform);
            if (tf) tf.setContentSize(w, BattleHUD.BAR_H);
            const sprite = barBG.getComponent(Sprite);
            if (sprite) {
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                const sf = TextureFactory.bar(w, BattleHUD.BAR_H);
                if (sf) {
                    sprite.spriteFrame = sf;
                    sprite.color = new Color(255, 255, 255, 255);
                } else {
                    sprite.color = new Color(198, 214, 232, 255);
                }
            }
        }

        const styleLabel = (label: Label | null, x: number) => {
            if (!label) return;
            label.fontSize = BattleHUD.FONT;
            label.lineHeight = BattleHUD.FONT + 6;
            label.color = new Color(58, 58, 74, 255);
            label.node.setPosition(x, 0, 0);
        };

        // 左侧：剩余雷数 / 已插旗
        styleLabel(this.mineCountLabel, -half + 72);
        styleLabel(this.flagCountLabel, -half + 190);
        // 中间：计时器
        styleLabel(this.timerLabel, 0);

        // 右侧：暂停/继续（同一个按钮，按下后就地变成继续）+ 重开
        // 位置按"按钮半宽 + 内边距"算，保证不会溢出到栏外
        const pad = 14;
        const halfBtn = BattleHUD.BTN / 2;
        const restartX = half - pad - halfBtn;
        const pauseX = restartX - BattleHUD.BTN - 12;
        this._styleButton(this.pauseBtn, pauseX, "neutral");
        this._styleButton(this.restartBtn, restartX, "neutral");
        this._pauseLayoutX = pauseX;

        this._refreshPauseButton();
    }

    /** 同一个按钮：运行中显示⏸️，暂停后就地变成▶️ */
    private _refreshPauseButton(): void {
        if (!this.pauseBtn || !Number.isFinite(this._pauseLayoutX)) return;
        this._styleButton(this.pauseBtn, this._pauseLayoutX, this._isPaused ? "primary" : "neutral");
        const icon = this.pauseBtn.getComponentInChildren(Label);
        if (icon) icon.string = this._isPaused ? "▶️" : "⏸️";
    }

    private _styleButton(btn: Node | null, x: number, tone: "neutral" | "primary" | "disabled"): void {
        if (!btn) return;
        btn.setPosition(x, 0, 0);
        const tf = btn.getComponent(UITransform);
        if (tf) tf.setContentSize(BattleHUD.BTN, BattleHUD.BTN);
        const sprite = btn.getComponent(Sprite);
        if (sprite) {
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const sf = TextureFactory.button(BattleHUD.BTN, BattleHUD.BTN, tone);
            if (sf) {
                sprite.spriteFrame = sf;
                sprite.color = new Color(255, 255, 255, 255);
            } else {
                sprite.color = tone === "disabled"
                    ? new Color(226, 231, 238, 255)
                    : new Color(255, 255, 255, 255);
            }
        }
        // 按钮里的图标文字居中
        const icon = btn.getComponentInChildren(Label);
        if (icon) {
            icon.fontSize = Math.round(BattleHUD.BTN * 0.55);
            icon.lineHeight = BattleHUD.BTN;
            icon.color = new Color(58, 58, 74, 255);
            icon.node.setPosition(0, 0, 0);
        }
    }

    private _fixLayer(): void {
        const UI_2D = Layers.Enum.UI_2D;
        this.node.walk(n => { n.layer = UI_2D; });
    }

    public startTimer(): void {
        this._startTime = Date.now();
        this._pausedTotal = 0;
        this._pauseStartedAt = 0;
        this._isPaused = false;
        this._running = true;
        this._lastElapsed = 0;
        this._refreshPauseButton();
        this._updateTimer();
    }

    public stopTimer(): void {
        if (this._running) {
            this._lastElapsed = this.getElapsedSeconds();
            this._running = false;
        }
    }

    /** 计时不含暂停时长 */
    public getElapsedSeconds(): number {
        if (!this._running) return this._lastElapsed;
        const now = this._isPaused ? this._pauseStartedAt : Date.now();
        return Math.max(0, Math.floor((now - this._startTime - this._pausedTotal) / 1000));
    }

    public togglePause(): void {
        if (!this._running) return;
        if (this._isPaused) {
            this._pausedTotal += Date.now() - this._pauseStartedAt;
            this._pauseStartedAt = 0;
            this._isPaused = false;
        } else {
            this._pauseStartedAt = Date.now();
            this._isPaused = true;
        }
        this._refreshPauseButton();
        this._updateTimer();
        this.onPause?.(this._isPaused);
    }

    public get isPaused(): boolean { return this._isPaused; }
    public updateMineCount(remaining: number, flagged: number): void {
        if (this.mineCountLabel) this.mineCountLabel.string = "💣 " + remaining;
        if (this.flagCountLabel) this.flagCountLabel.string = "🚩 " + flagged;
    }
    public showVictoryStars(): void { /* M2 用粒子系统实现撒花 */ }
    public showDefeatAnimation(): void { /* M2 用淡红色 + 慢镜头 */ }
    private _updateTimer(): void {
        if (!this._running) return;
        const elapsed = this.getElapsedSeconds();
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        if (this.timerLabel) {
            this.timerLabel.string = (this._isPaused ? "⏸️ " : "⏱️ ") + min + ":" + (sec < 10 ? "0" : "") + sec;
        }
        if (this._isPaused) return;   // 暂停时停住刷新
        this.scheduleOnce(() => this._updateTimer(), 1);
    }
    private _reset(): void {
        if (this.timerLabel) this.timerLabel.string = "⏱️ 0:00";
        if (this.mineCountLabel) this.mineCountLabel.string = "💣 0";
        if (this.flagCountLabel) this.flagCountLabel.string = "🚩 0";
    }
    /** 同一个按钮：暂停时点它就是继续 */
    onPauseClicked() { this.togglePause(); }
    onContinueClicked() { if (this._isPaused) this.togglePause(); }
    onRestartClicked() { this.onRestart?.(); }
}
