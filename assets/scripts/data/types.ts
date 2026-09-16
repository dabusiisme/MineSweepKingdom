/**
 * 全局类型定义
 * MineSweep Kingdom / 扫雷大王
 */

import { Vec2 } from 'cc';

/** 格子状态机 */
export enum CellState {
    HIDDEN = 0,         // 未翻开
    REVEALED = 1,       // 已翻开
    FLAGGED = 2,        // 已插旗
    QUESTION = 3,       // 问号（可选）
}

/** 棋盘坐标 */
export type CellCoord = { row: number; col: number };

/** 难度配置 */
export interface DifficultyConfig {
    id: string;
    name: string;
    rows: number;
    cols: number;
    mineCount: number;
    timeLimit?: number;       // 秒，undefined = 不限时
    difficulty: number;       // 难度系数
}

/** 单步操作（用于撤销/回放） */
export interface MoveAction {
    type: 'reveal' | 'flag' | 'unflag' | 'chord';
    coord: CellCoord;
    timestamp: number;
}

/** 战斗结果 */
export interface BattleResult {
    win: boolean;
    duration: number;          // 秒
    moves: MoveAction[];
    flagsUsed: number;
    minesRevealed: number;
    difficulty: string;
}

/** 事件总线事件名 */
export const GameEvent = {
    CELL_REVEALED: 'cell.revealed',
    CELL_FLAGGED: 'cell.flagged',
    MINE_TRIGGERED: 'mine.triggered',
    BOARD_CLEARED: 'board.cleared',
    GAME_OVER: 'game.over',
    GAME_WIN: 'game.win',
    TIME_TICK: 'time.tick',
} as const;
