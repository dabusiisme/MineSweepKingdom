/**
 * CellView 单个格子视图
 * 基于 Moodboard 治愈系风格
 */
import { _decorator, Component, Node, Sprite, Label, UITransform, tween, Vec3, Color, EventTouch } from "cc";
import { Cell } from "../core/Cell";
import { NUMBER_COLORS } from "../data/ConfigLoader";

const { ccclass, property } = _decorator;

@ccclass("CellView")
export class CellView extends Component {
    @property(Sprite) bgSprite: Sprite | null = null;
    @property(Label) numberLabel: Label | null = null;
    @property(Sprite) flagSprite: Sprite | null = null;
    @property(Sprite) mineSprite: Sprite | null = null;
    private _cell: Cell | null = null;
    private _row: number = 0;
    private _col: number = 0;
    private _pressTimer: number | null = null;
    private _pressStartX: number = 0;
    private _pressStartY: number = 0;
    private _longPressTriggered: boolean = false;
    private _lastTapTime: number = 0;
    private static readonly LONG_PRESS_MS = 500;
    private static readonly MOVE_THRESHOLD = 15;
    private static readonly DOUBLE_TAP_MS = 300;
    public get cell(): Cell | null { return this._cell; }
    public get row(): number { return this._row; }
    public get col(): number { return this._col; }
    public init(cell: Cell, row: number, col: number, size: number): void {
        this._cell = cell;
        this._row = row;
        this._col = col;
        const transform = this.node.getComponent(UITransform);
        if (transform) { transform.width = size; transform.height = size; }
        // 背景铺满整个格子
        if (this.bgSprite) {
            const bgTransform = this.bgSprite.node.getComponent(UITransform);
            if (bgTransform) { bgTransform.width = size; bgTransform.height = size; }
        }
        // 旗子/地雷图标按格子比例缩放
        const iconSize = Math.max(12, Math.round(size * 0.75));
        if (this.flagSprite) {
            const flagTransform = this.flagSprite.node.getComponent(UITransform);
            if (flagTransform) { flagTransform.width = iconSize; flagTransform.height = iconSize; }
        }
        if (this.mineSprite) {
            const mineTransform = this.mineSprite.node.getComponent(UITransform);
            if (mineTransform) { mineTransform.width = iconSize; mineTransform.height = iconSize; }
        }
        if (this.numberLabel) {
            this.numberLabel.fontSize = Math.max(12, Math.round(size * 0.6));
        }
        this.updateView();
        this.node.on(Node.EventType.TOUCH_START, this._onTouchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this._onTouchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this._onTouchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this._onTouchCancel, this);
    }
    public updateView(): void {
        if (!this._cell) return;
        if (this.flagSprite) this.flagSprite.node.active = false;
        if (this.mineSprite) this.mineSprite.node.active = false;
        if (this.numberLabel) this.numberLabel.node.active = false;
        if (this._cell.isRevealed()) {
            if (this.bgSprite) this.bgSprite.color = new Color(250, 250, 252, 255);
            if (this._cell.adjacentMines > 0 && this.numberLabel) {
                this.numberLabel.node.active = true;
                this.numberLabel.color = new Color(NUMBER_COLORS[this._cell.adjacentMines]);
                this.numberLabel.string = this._cell.adjacentMines.toString();
            }
            if (this._cell.hasMine && this.mineSprite) {
                this.mineSprite.node.active = true;
                this.mineSprite.color = new Color(70, 74, 84, 255);
            }
        } else {
            if (this.bgSprite) this.bgSprite.color = new Color(210, 214, 222, 255);
            if (this._cell.isFlagged() && this.flagSprite) {
                this.flagSprite.node.active = true;
                this.flagSprite.color = new Color(255, 96, 96, 255);
            }
        }
    }
    public async reveal(): Promise<void> {
        if (!this._cell || this._cell.isRevealed()) return;
        this.node.scale = new Vec3(1.1, 1.1, 1);
        tween(this.node).to(0.3, { scale: new Vec3(1, 1, 1) }).start();
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    private _onTouchStart(event: EventTouch): void {
        if (!this._cell || this._cell.isRevealed()) return;
        this._longPressTriggered = false;
        const pos = event.getUILocation();
        this._pressStartX = pos.x;
        this._pressStartY = pos.y;
        this._clearPressTimer();
        this._pressTimer = setTimeout(() => {
            this._pressTimer = null;
            if (!this._cell || this._cell.isRevealed()) return;
            this._longPressTriggered = true;
            this.node.emit("cell.flag", { row: this._row, col: this._col });
        }, CellView.LONG_PRESS_MS) as unknown as number;
    }
    private _onTouchMove(event: EventTouch): void {
        if (this._pressTimer === null) return;
        const pos = event.getUILocation();
        const dx = pos.x - this._pressStartX;
        const dy = pos.y - this._pressStartY;
        if (dx * dx + dy * dy > CellView.MOVE_THRESHOLD * CellView.MOVE_THRESHOLD) {
            this._clearPressTimer();
        }
    }
    private _onTouchEnd(event: EventTouch): void {
        if (!this._cell) return;
        this._clearPressTimer();
        if (this._longPressTriggered) {
            this._longPressTriggered = false;
            return;
        }
        if (this._cell.isRevealed()) {
            // 已翻开的数字格：双击触发 chord
            if (this._cell.adjacentMines > 0) {
                const now = Date.now();
                if (now - this._lastTapTime < CellView.DOUBLE_TAP_MS) {
                    this._lastTapTime = 0;
                    this.node.emit("cell.chord", { row: this._row, col: this._col });
                } else {
                    this._lastTapTime = now;
                }
            }
            return;
        }
        if (this._cell.isHidden()) {
            this.node.emit("cell.reveal", { row: this._row, col: this._col });
        }
    }
    private _onTouchCancel(): void {
        this._clearPressTimer();
        this._longPressTriggered = false;
    }
    private _clearPressTimer(): void {
        if (this._pressTimer !== null) {
            clearTimeout(this._pressTimer);
            this._pressTimer = null;
        }
    }
}
