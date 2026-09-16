/**
 * Board 棋盘类
 * 负责棋盘数据 + BFS 展开 + chord 逻辑 + 胜负判定
 */
import { EventTarget } from 'cc';
import { Cell } from './Cell';
import { MineGenerator } from './MineGenerator';
import { GameEvent, CellCoord, MoveAction } from '../data/types';

export class Board {
    public readonly rows: number;
    public readonly cols: number;
    public readonly mineCount: number;
    public cells: Cell[][];
    public eventTarget: EventTarget = new EventTarget();

    private _revealedCount: number = 0;
    private _flaggedCount: number = 0;
    private _isGameOver: boolean = false;
    private _isWin: boolean = false;
    private _moves: MoveAction[] = [];

    constructor(rows: number, cols: number, mineCount: number) {
        this.rows = rows;
        this.cols = cols;
        this.mineCount = mineCount;
        this.cells = [];
        for (let r = 0; r < rows; r++) {
            const row: Cell[] = [];
            for (let c = 0; c < cols; c++) {
                row.push(new Cell(r, c));
            }
            this.cells.push(row);
        }
    }

    public getCell(row: number, col: number): Cell | null {
        if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
        return this.cells[row][col];
    }

    public getRevealedCount(): number { return this._revealedCount; }
    public getFlaggedCount(): number { return this._flaggedCount; }
    public getRemainingMines(): number { return this.mineCount - this._flaggedCount; }
    public isGameOver(): boolean { return this._isGameOver; }
    public isWin(): boolean { return this._isWin; }
    public getMoves(): MoveAction[] { return this._moves; }

    /**
     * 翻开格子（首次点击会触发布雷）
     * @returns true = 翻开成功 / 触发雷
     */
    public reveal(coord: CellCoord): boolean {
        if (this._isGameOver) return false;
        const cell = this.getCell(coord.row, coord.col);
        if (!cell || !cell.isHidden()) return false;

        // 首次翻开 → 先布雷
        if (this._moves.length === 0) {
            MineGenerator.generate(this.cells, this.mineCount, coord);
        }

        if (cell.hasMine) {
            cell.reveal();
            this._revealedCount++;
            this._isGameOver = true;
            this._isWin = false;
            this._recordMove('reveal', coord);
            this._revealAllMines();
            this.eventTarget.emit(GameEvent.MINE_TRIGGERED, coord);
            this.eventTarget.emit(GameEvent.GAME_OVER, { win: false, coord });
            return true;
        }

        // BFS 展开（空格会扩散）
        const queue: Cell[] = [cell];
        const visited = new Set<string>();
        while (queue.length > 0) {
            const cur = queue.shift()!;
            const key = `${cur.coord.row},${cur.coord.col}`;
            if (visited.has(key)) continue;
            visited.add(key);
            if (cur.isRevealed()) continue;
            if (cur.isFlagged()) continue;
            if (cur.hasMine) continue;

            cur.reveal();
            this._revealedCount++;
            this.eventTarget.emit(GameEvent.CELL_REVEALED, cur);

            // 空格 → 8 邻居入队
            if (cur.adjacentMines === 0) {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nb = this.getCell(cur.coord.row + dr, cur.coord.col + dc);
                        if (nb && !nb.isRevealed() && !nb.isFlagged() && !nb.hasMine) {
                            queue.push(nb);
                        }
                    }
                }
            }
        }

        this._recordMove('reveal', coord);
        this._checkWin();
        return true;
    }

    /**
     * 切换插旗
     */
    public toggleFlag(coord: CellCoord): boolean {
        if (this._isGameOver) return false;
        const cell = this.getCell(coord.row, coord.col);
        if (!cell || cell.isRevealed()) return false;
        if (cell.toggleFlag()) {
            this._flaggedCount += cell.isFlagged() ? 1 : -1;
            this._recordMove(cell.isFlagged() ? 'flag' : 'unflag', coord);
            this.eventTarget.emit(GameEvent.CELL_FLAGGED, cell);
            return true;
        }
        return false;
    }

    /**
     * 双击数字 → 一键展开（chord）
     * 条件：周围旗数 == 数字
     */
    public chord(coord: CellCoord): boolean {
        if (this._isGameOver) return false;
        const cell = this.getCell(coord.row, coord.col);
        if (!cell || !cell.isRevealed()) return false;

        let flaggedCount = 0;
        const neighbors: Cell[] = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nb = this.getCell(coord.row + dr, coord.col + dc);
                if (nb) {
                    if (nb.isFlagged()) flaggedCount++;
                    else if (nb.isHidden()) neighbors.push(nb);
                }
            }
        }

        if (!cell.canChord(flaggedCount)) return false;
        this._recordMove('chord', coord);

        for (const nb of neighbors) {
            this.reveal(nb.coord);  // 注意：触雷会触发 GAME_OVER
        }
        return true;
    }

    /** 撤销上一步（每日限 3 次） */
    public undo(): boolean {
        if (this._moves.length === 0 || this._isGameOver) return false;
        const last = this._moves.pop()!;
        const cell = this.getCell(last.coord.row, last.coord.col);
        if (!cell) return false;

        if (last.type === 'reveal' || last.type === 'chord') {
            // 简化：只把状态置回 HIDDEN；实际需要重做 BFS 撤销整片
            // 生产环境应保存 reveal 时的扩散集合
            cell.state = 0;  // CellState.HIDDEN
            this._revealedCount = Math.max(0, this._revealedCount - 1);
        } else if (last.type === 'flag' || last.type === 'unflag') {
            cell.toggleFlag();
            this._flaggedCount += cell.isFlagged() ? 1 : -1;
        }
        return true;
    }

    private _revealAllMines(): void {
        for (const row of this.cells) {
            for (const cell of row) {
                if (cell.hasMine && !cell.isRevealed()) {
                    cell.reveal();
                    this.eventTarget.emit(GameEvent.CELL_REVEALED, cell);
                }
            }
        }
    }

    private _checkWin(): void {
        const totalSafe = this.rows * this.cols - this.mineCount;
        if (this._revealedCount >= totalSafe && !this._isGameOver) {
            this._isGameOver = true;
            this._isWin = true;
            this.eventTarget.emit(GameEvent.BOARD_CLEARED);
            this.eventTarget.emit(GameEvent.GAME_WIN, { win: true });
        }
    }

    private _recordMove(type: MoveAction['type'], coord: CellCoord): void {
        this._moves.push({ type, coord, timestamp: Date.now() });
    }
}
