/**
 * MineGenerator 布雷算法
 * 关键约束：首次点击的格子及其邻居永远不会是雷
 */
import { Cell } from './Cell';
import { CellCoord } from '../data/types';

export class MineGenerator {
    /**
     * 在保证"首格安全"的前提下布雷
     * @param board 棋盘所有格子（已 new 出来，状态 = HIDDEN）
     * @param mineCount 雷数
     * @param firstClick 首次点击坐标
     */
    public static generate(
        board: Cell[][],
        mineCount: number,
        firstClick: CellCoord
    ): void {
        const rows = board.length;
        const cols = board[0].length;

        // 1) 收集"安全区"：首格 + 周围 8 格
        const safeZone = new Set<string>();
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const r = firstClick.row + dr;
                const c = firstClick.col + dc;
                if (r >= 0 && r < rows && c >= 0 && c < cols) {
                    safeZone.add(`${r},${c}`);
                }
            }
        }

        // 2) 收集"可布雷"位置
        const candidates: CellCoord[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const key = `${r},${c}`;
                if (!safeZone.has(key)) {
                    candidates.push({ row: r, col: c });
                }
            }
        }

        // 3) Fisher-Yates 洗牌，取前 mineCount 个
        const actualMineCount = Math.min(mineCount, candidates.length);
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        for (let i = 0; i < actualMineCount; i++) {
            const { row, col } = candidates[i];
            board[row][col].hasMine = true;
        }

        // 4) 计算每个格子的相邻雷数
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (board[r][c].hasMine) continue;
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                            if (board[nr][nc].hasMine) count++;
                        }
                    }
                }
                board[r][c].adjacentMines = count;
            }
        }
    }

    /** 校验雷位一致性（联机用） */
    public static computeHash(board: Cell[][]): string {
        // 简单实现：拼接 hasMine → 32-bit FNV-1a
        let hash = 0x811c9dc5;
        for (const row of board) {
            for (const cell of row) {
                hash ^= cell.hasMine ? 1 : 0;
                hash = (hash * 0x01000193) >>> 0;
            }
        }
        return hash.toString(16).padStart(8, '0');
    }
}
