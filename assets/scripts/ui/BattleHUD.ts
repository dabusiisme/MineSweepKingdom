/**
 * BattleHUD 战斗 HUD
 * 顶部状态条：倒计时 | 剩余雷数 | 暂停按钮
 */
import { _decorator, Component, Node, Label, Sprite, Color, tween, Vec3, Layers } from "cc";
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
    public onPause?: () => void;
    public onRestart?: () => void;

    onLoad() {
        this._fixLayer();
        this._reset();
    }

    private _fixLayer(): void {
        const UI_2D = Layers.Enum.UI_2D;
        this.node.walk(n => { n.layer = UI_2D; });
    }

    public startTimer(): void { this._startTime = Date.now(); this._updateTimer(); }
    public stopTimer(): void { this._startTime = 0; }
    public getElapsedSeconds(): number {
        if (this._startTime === 0) return 0;
        return Math.floor((Date.now() - this._startTime) / 1000);
    }
    public updateMineCount(remaining: number, flagged: number): void {
        if (this.mineCountLabel) this.mineCountLabel.string = "💣 " + remaining;
        if (this.flagCountLabel) this.flagCountLabel.string = "🚩 " + flagged;
    }
    public showVictoryStars(): void { /* M2 用粒子系统实现撒花 */ }
    public showDefeatAnimation(): void { /* M2 用淡红色 + 慢镜头 */ }
    private _updateTimer(): void {
        if (this._isPaused || this._startTime === 0) return;
        const elapsed = Math.floor((Date.now() - this._startTime) / 1000);
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        if (this.timerLabel) this.timerLabel.string = "⏱️ " + min + ":" + (sec < 10 ? "0" : "") + sec;
        this.scheduleOnce(() => this._updateTimer(), 1);
    }
    private _reset(): void {
        if (this.timerLabel) this.timerLabel.string = "⏱️ 0:00";
        if (this.mineCountLabel) this.mineCountLabel.string = "💣 0";
        if (this.flagCountLabel) this.flagCountLabel.string = "🚩 0";
    }
    onPauseClicked() { this._isPaused = !this._isPaused; this.onPause?.(); }
    onRestartClicked() { this.onRestart?.(); }
}
