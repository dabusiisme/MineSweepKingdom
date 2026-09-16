/**
 * BattleScene 战斗场景主控
 * 整合 BoardView + BattleHUD + ResultPopup
 */
import { _decorator, Component, Node, view, screen, Layers } from "cc";
import { Board } from "../core/Board";
import { GameManager } from "../core/GameManager";
import { ClassicMode } from "../modes/ClassicMode";
import { BoardView } from "./BoardView";
import { BattleHUD } from "./BattleHUD";
import { ResultPopup } from "./ResultPopup";
import { AudioManager } from "../core/AudioManager";
const { ccclass, property } = _decorator;

@ccclass("BattleScene")
export class BattleScene extends Component {
    @property(BoardView) boardView: BoardView | null = null;
    @property(BattleHUD) hud: BattleHUD | null = null;
    @property(ResultPopup) resultPopup: ResultPopup | null = null;
    private _mode: ClassicMode | null = null;
    private _startTime: number = 0;

    onLoad() {
        // Auto-discover HUD and ResultPopup if prefab bindings are null
        this._autoBind();
    }

    private _autoBind(): void {
        if (!this.hud) {
            for (const child of this.node.children) {
                const hud = child.getComponent(BattleHUD);
                if (hud) { this.hud = hud; break; }
            }
        }
        if (!this.resultPopup) {
            for (const child of this.node.children) {
                const popup = child.getComponent(ResultPopup);
                if (popup) { this.resultPopup = popup; break; }
            }
        }
        // Fix layer: set all descendants to UI_2D layer
        const UI_2D = Layers.Enum.UI_2D;
        this.node.walk(n => { n.layer = UI_2D; });
    }

    start() { this._startGame("medium"); }

    public _startGame(difficultyId: string): void {
        this._mode = new ClassicMode();
        const board = this._mode.start(difficultyId);
        this._startTime = Date.now();

        const winSize = screen.windowSize;
        const maxW = winSize.width - 40;
        const maxH = winSize.height - 200;
        this.boardView?.initBoard(board, maxW, maxH);

        // Position HUD above the board
        if (this.hud && this.boardView) {
            const barY = (this.boardView.boardPixelHeight || 0) / 2 + 48;
            this.hud.node.setPosition(0, barY, 0);
        }
        // Center popup
        if (this.resultPopup) {
            this.resultPopup.node.setPosition(0, 0, 0);
        }

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
            this.hud.onPause = () => this._onPause();
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
        return Math.floor((Date.now() - this._startTime) / 1000);
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

    private _onPause(): void { /* M2 完善 */ }
    private _restart(): void { if (this._mode) this._startGame(this._mode.difficulty?.id || "medium"); }
}
