/**
 * Cell 格子类
 * 单个格子的数据 + 行为
 */
import { _decorator } from 'cc';
import { CellState, CellCoord } from '../data/types';

const { ccclass, property } = _decorator;

@ccclass('Cell')
export class Cell {
    public coord: CellCoord;
    public hasMine: boolean = false;
    public adjacentMines: number = 0;     // 周围 8 格的雷数
    public state: CellState = CellState.HIDDEN;

    constructor(row: number, col: number) {
        this.coord = { row, col };
    }

    public isHidden(): boolean {
        return this.state === CellState.HIDDEN;
    }

    public isRevealed(): boolean {
        return this.state === CellState.REVEALED;
    }

    public isFlagged(): boolean {
        return this.state === CellState.FLAGGED;
    }

    public reveal(): boolean {
        if (this.state === CellState.FLAGGED) return false;  // 插旗不能翻开
        if (this.state === CellState.REVEALED) return false;
        this.state = CellState.REVEALED;
        return true;
    }

    public toggleFlag(): boolean {
        if (this.state === CellState.REVEALED) return false;
        if (this.state === CellState.FLAGGED) {
            this.state = CellState.HIDDEN;
        } else {
            this.state = CellState.FLAGGED;
        }
        return true;
    }

    /** 用于"chord"双击展开：检查周围旗数是否等于数字 */
    public canChord(flaggedNeighbors: number): boolean {
        return this.isRevealed()
            && this.adjacentMines > 0
            && this.adjacentMines === flaggedNeighbors;
    }
}
