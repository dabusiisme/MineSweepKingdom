/**
 * GameManager 全局管理器
 * 单例，负责：当前局管理 + 跨场景数据 + 存档
 */
import { _decorator, Component, director, Node } from 'cc';
import { Board } from './Board';
import { DIFFICULTY_CONFIGS } from '../data/ConfigLoader';
import { BattleResult, DifficultyConfig, GameEvent } from '../data/types';

const { ccclass } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
    private static _instance: GameManager | null = null;
    public static get instance(): GameManager {
        if (!this._instance) {
            const node = new Node('GameManager');
            this._instance = node.addComponent(GameManager);
            director.addPersistRootNode(node);
        }
        return this._instance;
    }

    private _board: Board | null = null;
    private _difficulty: DifficultyConfig | null = null;
    private _startTime: number = 0;
    private _endTime: number = 0;

    public get board(): Board | null { return this._board; }
    public get difficulty(): DifficultyConfig | null { return this._difficulty; }

    /** 开始一局新游戏 */
    public startGame(difficultyId: string): Board {
        const cfg = DIFFICULTY_CONFIGS[difficultyId];
        if (!cfg) throw new Error(`Unknown difficulty: ${difficultyId}`);

        this._difficulty = cfg;
        this._board = new Board(cfg.rows, cfg.cols, cfg.mineCount);
        this._startTime = Date.now();

        // 监听结束事件
        this._board.eventTarget.on(GameEvent.GAME_OVER, this._onGameOver, this);
        this._board.eventTarget.on(GameEvent.GAME_WIN, this._onGameWin, this);

        return this._board;
    }

    public getElapsedSeconds(): number {
        if (this._startTime === 0) return 0;
        const end = this._endTime > 0 ? this._endTime : Date.now();
        return Math.floor((end - this._startTime) / 1000);
    }

    private _onGameOver(data: { win: boolean }): void {
        this._endTime = Date.now();
        this._saveResult({
            win: data.win,
            duration: this.getElapsedSeconds(),
            moves: this._board!.getMoves(),
            flagsUsed: this._board!.getFlaggedCount(),
            minesRevealed: 1,
            difficulty: this._difficulty!.id,
        });
    }

    private _onGameWin(_data: { win: boolean }): void {
        this._endTime = Date.now();
        this._saveResult({
            win: true,
            duration: this.getElapsedSeconds(),
            moves: this._board!.getMoves(),
            flagsUsed: this._board!.getFlaggedCount(),
            minesRevealed: 0,
            difficulty: this._difficulty!.id,
        });
    }

    private _saveResult(result: BattleResult): void {
        // v0.2: 写入 localStorage（生产环境切 IndexedDB / SQLite）
        try {
            const key = `battles.${result.difficulty}`;
            const history = JSON.parse(localStorage.getItem(key) || '[]');
            history.push({
                ...result,
                date: new Date().toISOString(),
            });
            // 只保留最近 50 局
            if (history.length > 50) history.shift();
            localStorage.setItem(key, JSON.stringify(history));
        } catch (e) {
            console.warn('[GameManager] save failed', e);
        }
    }

    public getHistory(difficultyId: string): BattleResult[] {
        try {
            const key = `battles.${difficultyId}`;
            return JSON.parse(localStorage.getItem(key) || '[]');
        } catch {
            return [];
        }
    }
}
