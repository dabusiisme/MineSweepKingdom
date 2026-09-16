/**
 * BoardView 棋盘视图
 * 负责创建所有 CellView，并统筹棋盘交互
 */
import { _decorator, Component, Node, Prefab, instantiate, UITransform, Layout, Vec2, EventTouch, input, Input } from "cc";
import { Cell } from "../core/Cell";
import { Board } from "../core/Board";
import { CellView } from "./CellView";
const { ccclass, property } = _decorator;

@ccclass("BoardView")
export class BoardView extends Component {
    @property(Prefab) cellPrefab: Prefab | null = null;
    @property(Node) boardContainer: Node | null = null;
    private _board: Board | null = null;
    private _cellViews: CellView[][] = [];
    private _cellSize: number = 40;
    private _boardPixelWidth: number = 0;
    private _boardPixelHeight: number = 0;
    public get board(): Board | null { return this._board; }
    public get cellViews(): CellView[][] { return this._cellViews; }
    public get boardPixelWidth(): number { return this._boardPixelWidth; }
    public get boardPixelHeight(): number { return this._boardPixelHeight; }
    public initBoard(board: Board, maxWidth: number, maxHeight: number): void {
        this._board = board;
        this._cellViews = [];
        if (this.boardContainer) this.boardContainer.destroyAllChildren();
        const cellSize = this._calculateCellSize(board.rows, board.cols, maxWidth, maxHeight);
        this._cellSize = cellSize;
        const gap = 2;
        const containerWidth = board.cols * (cellSize + gap) - gap;
        const containerHeight = board.rows * (cellSize + gap) - gap;
        this._boardPixelWidth = containerWidth;
        this._boardPixelHeight = containerHeight;
        if (this.boardContainer) {
            const transform = this.boardContainer.getComponent(UITransform);
            if (transform) { transform.width = containerWidth; transform.height = containerHeight; }
        }
        for (let r = 0; r < board.rows; r++) {
            this._cellViews[r] = [];
            for (let c = 0; c < board.cols; c++) {
                const cellView = this._createCellView(board.cells[r][c], r, c, cellSize, gap);
                this._cellViews[r][c] = cellView;
            }
        }
    }
    private _calculateCellSize(rows: number, cols: number, maxWidth: number, maxHeight: number): number {
        const gap = 2;
        const maxByWidth = Math.floor((maxWidth - (cols - 1) * gap) / cols);
        const maxByHeight = Math.floor((maxHeight - (rows - 1) * gap) / rows);
        return Math.max(20, Math.min(maxByWidth, maxByHeight, 60));
    }
    private _createCellView(cell: Cell, row: number, col: number, size: number, gap: number): CellView {
        if (!this.cellPrefab || !this.boardContainer) throw new Error("CellPrefab not set");
        const node = instantiate(this.cellPrefab);
        node.parent = this.boardContainer;
        const x = col * (size + gap) - (this._board!.cols * (size + gap) - gap) / 2 + size / 2;
        const y = -row * (size + gap) + (this._board!.rows * (size + gap) - gap) / 2 - size / 2;
        node.setPosition(x, y, 0);
        const cellView = node.getComponent(CellView);
        if (cellView) {
            cellView.init(cell, row, col, size);
            node.on("cell.reveal", (event: any) => this._onCellReveal(event), this);
            node.on("cell.flag", (event: any) => this._onCellFlag(event), this);
            node.on("cell.chord", (event: any) => this._onCellChord(event), this);
        }
        return cellView!;
    }
    private _onCellReveal(event: any): void {
        const { row, col } = event;
        this.node.emit("board.reveal", { row, col });
    }
    private _onCellFlag(event: any): void {
        const { row, col } = event;
        this.node.emit("board.flag", { row, col });
    }
    private _onCellChord(event: any): void {
        const { row, col } = event;
        this.node.emit("board.chord", { row, col });
    }
    public updateAllCells(): void {
        for (const row of this._cellViews) {
            for (const cellView of row) cellView.updateView();
        }
    }
    public getCellView(row: number, col: number): CellView | null {
        return this._cellViews[row]?.[col] || null;
    }
    public setupPinchZoom(): void {
        // M1 简化版：双指缩放/拖动用 Cocos 内置 UIScrollView 即可
        // 完整实现参考技能文档，在 M2 中完善
    }
}
