import Phaser from "phaser";
import { Camera } from "../engine/Camera";
import { TrackLayer, Side, isSwitch } from "./Track";
import { Train } from "./Train";
import { TrainRegistry } from "./TrainRegistry";
import { TrainPanel, TrainInfo } from "./TrainPanel";
import { worldToTile, tileToWorld, TILE_SIZE } from "./Grid";
import { drawMiniTool } from "./MiniTrack";

// ── Tool definitions ──────────────────────────────────────────────────────────

type TrackTool = "track-ns" | "track-ew" | "track-ne" | "track-nw" | "track-se" | "track-sw";
type SwitchTool = "sw-wes" | "sw-wen" | "sw-nse" | "sw-nsw"
                | "sw-ews" | "sw-ewn" | "sw-sne" | "sw-snw";
type StationTool = "station-h" | "station-v";
type Tool = TrackTool | SwitchTool | StationTool;

const TRACK_LIST: TrackTool[]   = ["track-ns", "track-ew", "track-ne", "track-nw", "track-se", "track-sw"];
const SWITCH_LIST: SwitchTool[] = ["sw-wes", "sw-wen", "sw-nse", "sw-nsw", "sw-ews", "sw-ewn", "sw-sne", "sw-snw"];
const STATION_LIST: StationTool[] = ["station-h", "station-v"];
const TOOL_LIST: Tool[] = [...TRACK_LIST, ...SWITCH_LIST, ...STATION_LIST];

const TRACK_CONNECTIONS: Record<TrackTool, [Side, Side]> = {
  "track-ns": [0, 2], "track-ew": [1, 3],
  "track-ne": [0, 1], "track-nw": [0, 3],
  "track-se": [2, 1], "track-sw": [2, 3],
};

interface SwitchDef { entry: Side; exits: [Side, Side]; }
const SWITCH_DEFS: Record<SwitchTool, SwitchDef> = {
  "sw-wes": { entry: 3, exits: [1, 2] },
  "sw-wen": { entry: 3, exits: [1, 0] },
  "sw-nse": { entry: 0, exits: [2, 1] },
  "sw-nsw": { entry: 0, exits: [2, 3] },
  "sw-ews": { entry: 1, exits: [3, 2] },
  "sw-ewn": { entry: 1, exits: [3, 0] },
  "sw-sne": { entry: 2, exits: [0, 1] },
  "sw-snw": { entry: 2, exits: [0, 3] },
};

const TRACK_LABELS: Record<TrackTool, string> = {
  "track-ns": "│", "track-ew": "─",
  "track-ne": "╰", "track-nw": "╯",
  "track-se": "╭", "track-sw": "╮",
};
const SWITCH_LABELS: Record<SwitchTool, string> = {
  "sw-wes": "→↓", "sw-wen": "→↑",
  "sw-nse": "↓→", "sw-nsw": "↓←",
  "sw-ews": "←↓", "sw-ewn": "←↑",
  "sw-sne": "↑→", "sw-snw": "↑←",
};
const STATION_LABELS: Record<StationTool, string> = {
  "station-h": "Stn─", "station-v": "Stn│",
};
const TOOL_LABELS: Record<Tool, string> = { ...TRACK_LABELS, ...SWITCH_LABELS, ...STATION_LABELS };

function isSwitchTool(tool: Tool): tool is SwitchTool {
  return tool.startsWith("sw-");
}
function isStationTool(tool: Tool): tool is StationTool {
  return tool.startsWith("station-");
}

// ── Train data ────────────────────────────────────────────────────────────────

const TRAIN_COLOURS = [0xe74c3c, 0x2980b9, 0xf1c40f, 0xecf0f1];

const TRAIN_NAMES = [
  "Big Engine",       "Steamy Roller",     "The Puffster",
  "Sir Tootsalot",    "Chugsworth",        "The Iron Biscuit",
  "Lord Smokington",  "Baron Von Puff",    "The Whistler",
  "Boiler McBoilface","Thunderclap",       "The Flying Kipper",
  "Old Wheezington",  "Clinker",           "Duchess of Soot",
  "Captain Coalbin",  "Rusty Bumper",      "The Screaming Kettle",
  "Hufflepuffer",     "Sir Belchington",   "The Cinder Queen",
  "Smokestacks McGee","Wobblesworth",      "The Grand Toaster",
  "Colonel Puffington","Lady Cinderbottom","Old Smokey",
  "Ember",            "The Belching Baron","The Midnight Rambler",
];

// ── Scene ─────────────────────────────────────────────────────────────────────

export class GameScene extends Phaser.Scene {
  private trackLayer!: TrackLayer;
  private trains:       Train[]   = [];
  private trainRegistry!: TrainRegistry;
  private trainPanel!:    TrainPanel;
  private selectedTrainId: string | null = null;
  private placementMode = false;
  private nextTrainId   = 0;
  private colourSlots   = [false, false, false, false]; // true = in use
  private usedNames     = new Set<string>();

  private camera!: Camera;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private activeTool: Tool = "track-ns";
  private toolBtnBgs: Phaser.GameObjects.Graphics[] = [];
  private toolBtnW:   number[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private deleteKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;

  // ── Tile selection ────────────────────────────────────────────
  private selectedCol: number | null = null;
  private selectedRow: number | null = null;
  private selectionGfx!: Phaser.GameObjects.Graphics;
  private deleteTileBtn!: Phaser.GameObjects.Text;

  constructor() { super("GameScene"); }

  create(): void {
    this.cameras.main.setBounds(-2000, -2000, 6000, 6000);

    this.drawGrid();
    this.trackLayer   = new TrackLayer(this);
    this.trainRegistry = new TrainRegistry();
    this.buildStarterLoop();

    this.selectionGfx = this.add.graphics().setDepth(3);

    this.camera  = new Camera(this);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.aKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.sKey     = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.deleteKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    this.input.keyboard!.on("keydown-ESC", () => {
      if (this.placementMode) this.exitPlacementMode();
    });

    this.trainPanel = new TrainPanel({
      onAdd:    () => this.enterPlacementMode(),
      onSelect: (id) => this.selectTrain(id),
      onStart:  (id) => { this.trains.find(t => t.id === id)?.start(); },
      onStop:   (id) => { this.trains.find(t => t.id === id)?.stop(); },
      onReverse:(id) => { this.trains.find(t => t.id === id)?.reverse(); },
      onRemove: (id) => this.removeTrain(id),
      onSpeedChange: (id, spd) => { this.trains.find(t => t.id === id)?.setSpeed(spd); },
    });

    this.setupToolbar();
    this.setupClickHandler();
    this.setupDeleteButton();

    this.statusText = this.add
      .text(10, window.innerHeight - 30, "", {
        fontSize: "14px", color: "#ffffff",
        backgroundColor: "#00000088", padding: { x: 6, y: 3 },
      })
      .setScrollFactor(0).setDepth(10);

    this.updateStatus();

    this.events.on("shutdown", () => this.trainPanel.destroy());
  }

  // ── Starter map ───────────────────────────────────────────────

  private buildStarterLoop(): void {
    const L = 4, R = 12, T = 4, B = 8;

    this.trackLayer.add(L, T, [2, 1]);
    this.trackLayer.add(R, T, [2, 3]);
    this.trackLayer.add(L, B, [0, 1]);
    this.trackLayer.add(R, B, [0, 3]);

    for (let c = L + 1; c < R; c++) {
      if (c === 7) {
        this.trackLayer.addSwitch(c, T, 3, [1, 2]);
      } else {
        this.trackLayer.add(c, T, [1, 3]);
      }
      this.trackLayer.add(c, B, [1, 3]);
    }

    for (let r = T + 1; r < B; r++) {
      this.trackLayer.add(L, r, [0, 2]);
      this.trackLayer.add(R, r, [0, 2]);
    }
  }

  // ── Grid ──────────────────────────────────────────────────────

  private drawGrid(): void {
    const g = this.add.graphics();
    g.lineStyle(1, 0x3a7a34, 0.4);
    for (let c = 0; c <= 80; c++) {
      g.beginPath(); g.moveTo(c * TILE_SIZE, 0); g.lineTo(c * TILE_SIZE, 80 * TILE_SIZE); g.strokePath();
    }
    for (let r = 0; r <= 80; r++) {
      g.beginPath(); g.moveTo(0, r * TILE_SIZE); g.lineTo(80 * TILE_SIZE, r * TILE_SIZE); g.strokePath();
    }
  }

  // ── Toolbar ───────────────────────────────────────────────────

  private readonly BTN_H = 42;
  private btnW(tool: Tool): number {
    if (isStationTool(tool)) return 52;
    if (isSwitchTool(tool))  return 46;
    return 42;
  }
  private btnColor(tool: Tool): number {
    if (isStationTool(tool)) return 0x16a085;
    if (isSwitchTool(tool))  return 0x8e44ad;
    return 0xe67e22;
  }

  private setupToolbar(): void {
    let x = 10;
    TRACK_LIST.forEach(tool => {
      this.makeToolButton(x, tool);
      x += this.btnW(tool) + 4;
    });

    this.add.graphics().fillStyle(0x666666, 1).fillRect(x + 4, 6, 2, this.BTN_H - 4)
      .setScrollFactor(0).setDepth(10);
    x += 14;

    SWITCH_LIST.forEach(tool => {
      this.makeToolButton(x, tool);
      x += this.btnW(tool) + 4;
    });

    this.add.graphics().fillStyle(0x666666, 1).fillRect(x + 4, 6, 2, this.BTN_H - 4)
      .setScrollFactor(0).setDepth(10);
    x += 14;

    STATION_LIST.forEach(tool => {
      this.makeToolButton(x, tool);
      x += this.btnW(tool) + 4;
    });

    this.highlightActiveTool();
  }

  private makeToolButton(x: number, tool: Tool): void {
    const w = this.btnW(tool);
    const h = this.BTN_H;

    const bgGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.drawBtnBg(bgGfx, w, h, 0x2d2d2d);

    const trackGfx = this.add.graphics().setScrollFactor(0).setDepth(10);
    drawMiniTool(trackGfx, tool, w, h);
    trackGfx.setPosition(x, 6);
    bgGfx.setPosition(x, 6);

    const hit = this.add.rectangle(x + w / 2, 6 + h / 2, w, h)
      .setScrollFactor(0).setDepth(11)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerdown", () => this.setTool(tool));

    this.toolBtnBgs.push(bgGfx);
    this.toolBtnW.push(w);
  }

  private drawBtnBg(g: Phaser.GameObjects.Graphics, w: number, h: number, color: number): void {
    g.clear();
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, w, h, 4);
  }

  private setTool(tool: Tool): void {
    this.activeTool = tool;
    this.highlightActiveTool();
    this.updateStatus();
  }

  private highlightActiveTool(): void {
    const activeIdx = TOOL_LIST.indexOf(this.activeTool);
    TOOL_LIST.forEach((tool, i) => {
      const bg = this.toolBtnBgs[i];
      if (!bg) return;
      const w = this.toolBtnW[i];
      const h = this.BTN_H;
      if (i === activeIdx) {
        this.drawBtnBg(bg, w, h, this.btnColor(tool));
        bg.lineStyle(2, 0xffffff, 0.5);
        bg.strokeRoundedRect(0, 0, w, h, 4);
      } else {
        this.drawBtnBg(bg, w, h, 0x2d2d2d);
      }
    });
  }

  private cycleTool(dir: 1 | -1): void {
    const idx = TOOL_LIST.indexOf(this.activeTool);
    this.setTool(TOOL_LIST[(idx + dir + TOOL_LIST.length) % TOOL_LIST.length]);
  }

  // ── Tile selection ────────────────────────────────────────────

  private setupDeleteButton(): void {
    this.deleteTileBtn = this.add
      .text(10, window.innerHeight - 62, "🗑  Delete tile  [D]", {
        fontSize: "14px", color: "#ffffff",
        backgroundColor: "#c0392b", padding: { x: 8, y: 5 },
      })
      .setScrollFactor(0).setDepth(10)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);

    this.deleteTileBtn.on("pointerdown", () => this.deleteSelectedTile());
  }

  private selectTile(col: number, row: number): void {
    this.selectedCol = col;
    this.selectedRow = row;
    this.selectedTrainId = null; // deselect train when selecting a tile
    this.drawSelection();
    this.deleteTileBtn.setVisible(true);
    this.updateStatus();
  }

  private deselectTile(): void {
    this.selectedCol = null;
    this.selectedRow = null;
    this.selectionGfx.clear();
    this.deleteTileBtn.setVisible(false);
    this.updateStatus();
  }

  private drawSelection(): void {
    if (this.selectedCol === null || this.selectedRow === null) return;
    const { x, y } = tileToWorld(this.selectedCol, this.selectedRow);
    const half = TILE_SIZE / 2;
    this.selectionGfx.clear();
    this.selectionGfx.fillStyle(0xf1c40f, 0.18);
    this.selectionGfx.fillRect(x - half + 1, y - half + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    this.selectionGfx.lineStyle(2, 0xf1c40f, 1);
    this.selectionGfx.strokeRect(x - half + 1, y - half + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }

  private deleteSelectedTile(): void {
    if (this.selectedCol === null || this.selectedRow === null) return;
    this.trackLayer.remove(this.selectedCol, this.selectedRow);
    this.deselectTile();
  }

  // ── Train management ──────────────────────────────────────────

  private enterPlacementMode(): void {
    if (this.trains.length >= 4) return;
    this.placementMode = true;
    this.trainPanel.setPlacementMode(true);
    document.body.style.cursor = "crosshair";
    this.updateStatus();
  }

  private exitPlacementMode(): void {
    this.placementMode = false;
    this.trainPanel.setPlacementMode(false);
    document.body.style.cursor = "";
    this.updateStatus();
  }

  private selectTrain(id: string): void {
    this.selectedTrainId = id;
    this.deselectTile();
  }

  private addTrain(col: number, row: number): void {
    const seg = this.trackLayer.get(col, row);
    if (!seg) return;

    const fromSide = this.startingFromSide(seg);
    const slot     = this.colourSlots.findIndex(s => !s);
    if (slot === -1) return;

    const id     = `train_${this.nextTrainId++}`;
    const name   = this.pickName();
    const colour = TRAIN_COLOURS[slot];

    this.colourSlots[slot] = true;
    this.usedNames.add(name);

    const train = new Train(
      this, this.trackLayer, this.trainRegistry,
      id, name, colour,
      col, row, fromSide
    );
    train.setSpeed(6);
    this.trains.push(train);
    this.selectedTrainId = id;
  }

  private removeTrain(id: string): void {
    const idx = this.trains.findIndex(t => t.id === id);
    if (idx === -1) return;

    const train = this.trains[idx];
    const slot  = TRAIN_COLOURS.indexOf(train.colour);

    train.destroy();
    this.trains.splice(idx, 1);

    if (slot !== -1) this.colourSlots[slot] = false;
    this.usedNames.delete(train.trainName);

    if (this.selectedTrainId === id) this.selectedTrainId = null;
  }

  private pickName(): string {
    const available = TRAIN_NAMES.filter(n => !this.usedNames.has(n));
    if (available.length === 0) return "Train";
    return available[Math.floor(Math.random() * available.length)];
  }

  /**
   * Determine the starting fromSide for a train placed on a given tile.
   * EW-connected tiles → fromSide East (train moves West).
   * NS-connected tiles → fromSide North (train moves South).
   * Curves → use first connection.
   */
  private startingFromSide(seg: ReturnType<TrackLayer["get"]>): Side {
    if (!seg || isSwitch(seg)) return 1; // shouldn't be called on switches
    const [a, b] = seg.connections;
    if ((a === 1 || a === 3) && (b === 1 || b === 3)) return 1; // EW
    if ((a === 0 || a === 2) && (b === 0 || b === 2)) return 0; // NS
    return a; // curve — use first connection
  }

  // ── Click handler ─────────────────────────────────────────────

  private setupClickHandler(): void {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown() || p.rightButtonDown()) return;
      if (p.y < 50) return; // toolbar

      const { col, row } = worldToTile(p.worldX, p.worldY);

      // ── Placement mode ────────────────────────────────────────
      if (this.placementMode) {
        const seg = this.trackLayer.get(col, row);
        if (!seg || isSwitch(seg)) {
          this.statusText.setText("Can't place here — use a plain track or station tile");
          return;
        }
        if (this.trains.some(t => t.tileCol === col && t.tileRow === row)) {
          this.statusText.setText("Tile is occupied by another train");
          return;
        }
        this.addTrain(col, row);
        this.exitPlacementMode();
        return;
      }

      // ── Normal mode ───────────────────────────────────────────
      const existing = this.trackLayer.get(col, row);
      if (existing) {
        this.selectTile(col, row);
      } else {
        this.deselectTile();
        if (isSwitchTool(this.activeTool)) {
          const def = SWITCH_DEFS[this.activeTool];
          this.trackLayer.addSwitch(col, row, def.entry, def.exits);
        } else if (isStationTool(this.activeTool)) {
          const orientation = this.activeTool === "station-h" ? "h" : "v";
          this.trackLayer.addStation(col, row, orientation);
        } else {
          this.trackLayer.add(col, row, TRACK_CONNECTIONS[this.activeTool as TrackTool]);
        }
      }
    });
  }

  // ── Status ────────────────────────────────────────────────────

  private updateStatus(): void {
    if (this.placementMode) {
      this.statusText?.setText("Placement mode — click a track tile  |  Esc to cancel");
      return;
    }
    if (this.selectedCol !== null && this.selectedRow !== null) {
      const seg  = this.trackLayer.get(this.selectedCol, this.selectedRow);
      const kind = seg && "entry" in seg ? "Switch selected" : "Track selected";
      const hints = seg && "entry" in seg
        ? "  |  Space: toggle switch  |  D: delete"
        : "  |  D: delete";
      this.statusText?.setText(`${kind} (${this.selectedCol},${this.selectedRow})${hints}`);
      return;
    }
    const label = TOOL_LABELS[this.activeTool];
    const kind  = isStationTool(this.activeTool) ? "Station"
                : isSwitchTool(this.activeTool)  ? "Switch"
                : "Track";
    this.statusText?.setText(`${kind} ${label}  |  A/S to cycle  |  click tile to place`);
  }

  // ── Game loop ─────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    this.camera.update(this.cursors);

    for (const train of this.trains) {
      train.update(delta);
    }

    // Sync panel (no-ops if nothing changed)
    const infos: TrainInfo[] = this.trains.map(t => ({
      id:       t.id,
      name:     t.trainName,
      colour:   t.colour,
      state:    t.trainState,
      speedTps: t.currentSpeed,
    }));
    this.trainPanel.render(infos, this.selectedTrainId);

    if (Phaser.Input.Keyboard.JustDown(this.aKey)) this.cycleTool(-1);
    if (Phaser.Input.Keyboard.JustDown(this.sKey))  this.cycleTool(1);

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      if (this.selectedCol !== null && this.selectedRow !== null) {
        this.trackLayer.toggleSwitch(this.selectedCol, this.selectedRow);
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.deleteKey)) {
      this.deleteSelectedTile();
    }

    this.updateStatus();
  }
}
