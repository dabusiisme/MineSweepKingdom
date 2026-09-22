/**
 * BattleHUD 战斗 HUD
 * 顶部状态条：倒计时 | 剩余雷数 | 暂停按钮
 */
import { _decorator, Component, Node, Label, Sprite, Color, Layers, UITransform } from "cc";
import { TextureLibrary } from "./TextureLibrary";
import { AudioManager } from "../core/AudioManager";
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
    /** 当前按钮边长，随栏宽等比缩放 */
    private _btnSize: number = BattleHUD.BTN;
    public onPause?: (paused: boolean) => void;
    public onRestart?: () => void;

    /** 状态栏高度。BattleScene 定位棋盘时也读这个值，别在两处各写一份 */
    public static readonly BAR_H = 160;
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
        // 以 726 宽（750 设计宽 - 两侧边距）为基准等比缩放。
        // 刘海机型可见宽度更窄（约 615），按这个比例缩字号和按钮才不会挤在一起。
        const k = Math.min(1, w / 726);
        const font = Math.max(19, Math.round(BattleHUD.FONT * k));
        this._btnSize = Math.max(44, Math.round(BattleHUD.BTN * k));

        // 背景条铺满
        const barBG = this.node.getChildByName('BarBG');
        if (barBG) {
            const tf = barBG.getComponent(UITransform);
            if (tf) tf.setContentSize(w, BattleHUD.BAR_H);
            const sprite = barBG.getComponent(Sprite);
            if (sprite) {
                if (!TextureLibrary.apply(sprite, "bar", w, BattleHUD.BAR_H)) {
                    sprite.color = new Color(198, 214, 232, 255);
                }
            }
        }

        const styleLabel = (label: Label | null, x: number) => {
            if (!label) return;
            label.fontSize = font;
            label.lineHeight = font + 6;
            label.color = new Color(58, 58, 74, 255);
            label.node.setPosition(x, 0, 0);
        };

        // 从左到右：雷数 / 旗数 / 暂停(继续) / 重开 / 计时，右侧整块留空。
        // 全部从左边起算，右半边空出来，所以整体重心偏左。
        const at = (mark: number) => -half + mark * k;
        styleLabel(this.mineCountLabel, at(78));
        styleLabel(this.flagCountLabel, at(200));
        this._styleButton(this.pauseBtn, at(340), "neutral");
        this._styleButton(this.restartBtn, at(424), "neutral");
        this._pauseLayoutX = at(340);
        // 计时器排在按钮右边
        styleLabel(this.timerLabel, at(540));

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
        if (tf) tf.setContentSize(this._btnSize, this._btnSize);
        const sprite = btn.getComponent(Sprite);
        if (sprite) {
            const tex = tone === "primary" ? "button_primary"
                      : tone === "disabled" ? "button_disabled"
                      : "button_neutral";
            if (!TextureLibrary.apply(sprite, tex, this._btnSize, this._btnSize)) {
                sprite.color = tone === "disabled"
                    ? new Color(226, 231, 238, 255)
                    : new Color(255, 255, 255, 255);
            }
        }
        // 按钮里的图标文字居中
        const icon = btn.getComponentInChildren(Label);
        if (icon) {
            icon.fontSize = Math.round(this._btnSize * 0.55);
            icon.lineHeight = this._btnSize;
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

    /** 切后台时用：只在计时进行中、且还没暂停时才暂停（避免"切出去再回来变成继续了"） */
    public pauseIfRunning(): void {
        if (this._running && !this._isPaused) this.togglePause();
    }

    /** 从暂停菜单点"继续"用：暂停中才恢复 */
    public resumeIfPaused(): void {
        if (this._running && this._isPaused) this.togglePause();
    }
    public updateMineCount(remaining: number, flagged: number): void {
        if (this.mineCountLabel) this.mineCountLabel.string = "💣 " + remaining;
        if (this.flagCountLabel) this.flagCountLabel.string = "🚩 " + flagged;
    }
    // 胜负表现（撒花 / 红闪）放在 BattleScene 里做：
    // 那两个特效要铺满全屏、盖在棋盘上，而 HUD 只负责顶部那一条。
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
    onPauseClicked() { AudioManager.play("click"); this.togglePause(); }
    onContinueClicked() { if (this._isPaused) { AudioManager.play("click"); this.togglePause(); } }
    onRestartClicked() { AudioManager.play("click"); this.onRestart?.(); }
}
