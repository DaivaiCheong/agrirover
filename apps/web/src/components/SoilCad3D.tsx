import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { BlockSoilProfile, PlantSoilRow } from "../lib/soil";

export type SoilCadProps = {
  zone: string;
  blockLabel: string;
  rows: number;
  cols: number;
  rowM: number;
  treeM: number;
  plants: PlantSoilRow[];
  filter: "all" | "attention" | "vision";
  selected: { row: number; col: number } | null;
  focusSeq?: number;
  onSelect: (row: number, col: number) => void;
  rover?: { row: number; col: number; heading: number } | null;
  soilProfile?: BlockSoilProfile;
  height?: number;
};

const C = {
  bg: 0xf4f7f2,
  gridMajor: 0xc8d3c2,
  gridMinor: 0xe3e8de,
  parcel: 0xeef3ea,
  boundary: 0x2e7d4f,
  bed: 0xdfd3be,
  bedEdge: 0xbcae93,
  padOptimal: 0xcbe5d2,
  edgeOptimal: 0x2e7d4f,
  padAttention: 0xfae2ba,
  edgeAttention: 0xc47918,
  padUnrecorded: 0xe4e8e3,
  edgeUnrecorded: 0x9aa49e,
  trunk: 0x6b4a2f,
  leafOptimal: 0x3b8e52,
  leafAttention: 0xd98a24,
  markerGray: 0xaab4ad,
  pick: 0x1f5c39,
  rover: 0x17261d,
};

function makeLabel(html: string, cls: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = cls;
  el.innerHTML = html;
  return new CSS2DObject(el);
}

function makeRectLoop(w: number, d: number, y: number, color: number, opacity = 1): THREE.LineLoop {
  const hw = w / 2, hd = d / 2;
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, y, -hd),
    new THREE.Vector3(hw, y, -hd),
    new THREE.Vector3(hw, y, hd),
    new THREE.Vector3(-hw, y, hd),
  ]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.LineLoop(geom, mat);
}

function makeLine(pts: THREE.Vector3[], color: number, opacity = 1): THREE.Line {
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  return new THREE.Line(geom, mat);
}

function tipFor(p: PlantSoilRow): string {
  if (!p.reached) return `${p.name} · Unrecorded`;
  if (!p.plant) return `${p.name} · No plant detected`;
  const parts = [p.name, `AI: ${p.vision.badgeLabel}`];
  if (p.vision.linkedNote) parts.push(p.vision.linkedNote);
  if (p.readings.ph !== null) parts.push(`pH ${p.readings.ph.toFixed(2)}`);
  if (p.readings.moisture !== null) parts.push(`Moisture ${p.readings.moisture.toFixed(1)}%`);
  return parts.join(" · ");
}

/** Fallback 2D interactive CAD SVG when WebGL is unavailable. */
function CadFallbackSvg({
  blockLabel, rows, cols, rowM, treeM, plants, filter, selected, onSelect, height,
}: Omit<SoilCadProps, "zone" | "focusSeq" | "rover" | "soilProfile">) {
  const [zoom, setZoom] = useState(1);
  const cellW = 54, cellH = 48, pad = 34;
  const w = cols * cellW + pad * 2;
  const h = rows * cellH + pad * 2;
  const byRc = new Map(plants.map((p) => [`${p.row},${p.col}`, p]));

  return (
    <div className="cad-wrap" style={{ height }}>
      <div className="cad-svg-stage">
        <svg viewBox={`0 0 ${w} ${h}`} className="cad-svg" style={{ transform: `scale(${zoom})` }}
             role="group" aria-label={`${blockLabel} 2D CAD fallback`}>
          <rect x={pad - 8} y={pad - 8} width={cols * cellW + 16} height={rows * cellH + 16}
                fill="#eef3ea" stroke="#2e7d4f" strokeWidth={1.5} rx={4} />
          {Array.from({ length: rows }, (_, row) => {
            const y = pad + (rows - 1 - row) * cellH;
            return (
              <g key={row}>
                <rect x={pad} y={y + 6} width={cols * cellW} height={cellH - 12} fill="#dfd3be" rx={3} />
                <text x={pad - 14} y={y + cellH / 2 + 4} className="cad-svg-row" textAnchor="end">R{row + 1}</text>
                {Array.from({ length: cols }, (_, col) => {
                  const p = byRc.get(`${row},${col}`);
                  if (!p) return null;
                  const x = pad + col * cellW;
                  const isPicked = selected?.row === row && selected?.col === col;
                  const dim =
                    (filter === "attention" && p.status !== "attention") ||
                    (filter === "vision" && p.vision.status !== "alert");
                  const fill = p.status === "optimal" ? "#cbe5d2" : p.status === "attention" ? "#fae2ba" : "#e4e8e3";
                  const stroke = isPicked ? "#1f5c39" : p.status === "optimal" ? "#2e7d4f" : p.status === "attention" ? "#c47918" : "#9aa49e";
                  return (
                    <g key={`${row}-${col}`} opacity={dim ? 0.3 : 1} style={{ cursor: "pointer" }} onClick={() => onSelect(row, col)}>
                      <rect x={x + 5} y={y + 9} width={cellW - 10} height={cellH - 18} rx={4}
                            fill={fill} stroke={stroke} strokeWidth={isPicked ? 2.5 : 1.2} />
                      <circle cx={x + cellW / 2} cy={y + cellH / 2} r={8}
                              fill={p.status === "optimal" ? "#3b8e52" : p.status === "attention" ? "#d98a24" : "#aab4ad"} />
                      <text x={x + cellW / 2} y={y + cellH - 11} textAnchor="middle" className="cad-svg-cell">{p.name}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
          <text x={w / 2} y={h - 8} textAnchor="middle" className="cad-svg-dim">
            {(cols * treeM).toFixed(1)} m × {(rows * rowM).toFixed(1)} m
          </text>
        </svg>
      </div>
      <div className="cad-hud-top-left">
        <span className="cad-pill"><b>{blockLabel}</b> · {(cols * treeM).toFixed(1)} × {(rows * rowM).toFixed(1)} m</span>
      </div>
      <div className="cad-hud-controls" role="group" aria-label="Viewport zoom controls">
        <button type="button" className="cad-ctrl-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(1)))}><Plus size={15} /></button>
        <button type="button" className="cad-ctrl-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.2).toFixed(1)))}><Minus size={15} /></button>
        <button type="button" className="cad-ctrl-btn cad-ctrl-reset" onClick={() => setZoom(1)}><RotateCcw size={13} />Reset view</button>
      </div>
    </div>
  );
}

/** Interactive 3D CAD land viewport for the selected block: raised beds (R1..Rn), status-coded plots and plant
 *  markers (R1 T1..), subtle coordinate grid, dynamic compass, explicit +/- zoom & Reset view, scroll-safe wheel. */
export default function SoilCad3D({
  zone,
  blockLabel,
  rows,
  cols,
  rowM,
  treeM,
  plants,
  filter,
  selected,
  focusSeq = 0,
  onSelect,
  rover,
  soilProfile,
  height = 440,
}: SoilCadProps) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const compassDial = useRef<SVGGElement>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const [noGl, setNoGl] = useState(false);

  const env = useRef<{
    renderer: THREE.WebGLRenderer;
    labels: CSS2DRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    content: THREE.Group;
    gridGroup: THREE.Group;
    rings: THREE.Mesh[];
    hits: THREE.Object3D[];
    plotCenters: Map<string, THREE.Vector3>;
    roverObj: THREE.Group | null;
    roverGoal: THREE.Vector3 | null;
    tween: { target: THREE.Vector3; pos: THREE.Vector3 } | null;
    defaultPose: { target: THREE.Vector3; pos: THREE.Vector3 };
  } | null>(null);

  const framedZone = useRef<string>("");

  function computeDefaultPose(rCount: number, cCount: number, rM: number, tM: number, aspect: number) {
    const w = cCount * tM;
    const d = rCount * rM;
    const span = Math.max(Math.hypot(w + 3.2, d + 3.2), 10);
    const halfFov = Math.atan(Math.tan((38 * Math.PI) / 360) * Math.min(1, Math.max(0.6, aspect)));
    const dist = ((span / 2) / Math.tan(halfFov)) * 1.18;
    const dir = new THREE.Vector3(0.28, 0.88, 0.96).normalize();
    const target = new THREE.Vector3(0, 0.25, 0);
    const pos = target.clone().add(dir.multiplyScalar(dist));
    return { target, pos };
  }

  function zoomBy(factor: number) {
    const e = env.current;
    if (!e) return;
    e.tween = null;
    const offset = e.camera.position.clone().sub(e.controls.target);
    const currentDist = offset.length();
    const nextDist = THREE.MathUtils.clamp(currentDist * factor, e.controls.minDistance, e.controls.maxDistance);
    offset.setLength(nextDist);
    e.tween = {
      target: e.controls.target.clone(),
      pos: e.controls.target.clone().add(offset),
    };
  }

  function resetView() {
    const e = env.current;
    if (!e) return;
    e.tween = {
      target: e.defaultPose.target.clone(),
      pos: e.defaultPose.pos.clone(),
    };
  }

  // Initialize Three.js scene once
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setNoGl(true);
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.domElement.className = "cad-labels";
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.bg);
    scene.fog = new THREE.Fog(C.bg, 120, 240);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.4, 500);
    camera.position.set(16, 26, 30);

    const controls = new OrbitControls(camera, labels.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false; // prevent mouse-wheel from trapping page scroll
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minPolarAngle = 0.14;
    controls.maxPolarAngle = 1.4;
    controls.minDistance = 4.5;
    controls.maxDistance = 140;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa68f, 1.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-28, 48, 32);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 180 });
    scene.add(sun);

    const gridGroup = new THREE.Group();
    const content = new THREE.Group();
    scene.add(gridGroup, content);

    const e = {
      renderer,
      labels,
      scene,
      camera,
      controls,
      content,
      gridGroup,
      rings: [] as THREE.Mesh[],
      hits: [] as THREE.Object3D[],
      plotCenters: new Map<string, THREE.Vector3>(),
      roverObj: null as THREE.Group | null,
      roverGoal: null as THREE.Vector3 | null,
      tween: null as { target: THREE.Vector3; pos: THREE.Vector3 } | null,
      defaultPose: { target: new THREE.Vector3(0, 0.25, 0), pos: new THREE.Vector3(16, 26, 30) },
    };
    env.current = e;

    const updateCompass = () => {
      if (!compassDial.current) return;
      const deg = THREE.MathUtils.radToDeg(controls.getAzimuthalAngle());
      compassDial.current.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    };
    controls.addEventListener("start", () => { e.tween = null; });
    controls.addEventListener("change", updateCompass);

    const syncSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      labels.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: [number, number] | null = null;
    const pickHit = (ev: PointerEvent) => {
      const rect = labels.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(e.hits, false)[0]?.object.userData as { row: number; col: number; tip: string } | undefined;
    };

    const onDown = (ev: PointerEvent) => {
      if (ev.button === 0) down = [ev.clientX, ev.clientY];
      else down = null;
    };
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) {
        down = null;
        return;
      }
      down = null;
      const badge = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-cad-plot]");
      if (badge) {
        const [r, c] = badge.dataset.cadPlot!.split(":").map(Number);
        selectRef.current(r, c);
        return;
      }
      const hit = pickHit(ev);
      if (hit) selectRef.current(hit.row, hit.col);
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons) return;
      const hit = pickHit(ev);
      labels.domElement.style.cursor = hit ? "pointer" : "grab";
      const box = tip.current;
      if (!box) return;
      if (hit) {
        const rect = el.getBoundingClientRect();
        box.textContent = hit.tip;
        box.style.transform = `translate(${ev.clientX - rect.left + 14}px, ${ev.clientY - rect.top + 14}px)`;
        box.style.opacity = "1";
      } else {
        box.style.opacity = "0";
      }
    };
    const onWheel = (ev: WheelEvent) => {
      // Allow intentional Ctrl/Cmd+wheel zoom while leaving standard wheel scroll free for the page
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      e.tween = null;
      const offset = camera.position.clone().sub(controls.target);
      const factor = ev.deltaY > 0 ? 1.12 : 0.89;
      offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
      camera.position.copy(controls.target).add(offset);
      controls.update();
    };

    const dom = labels.domElement;
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", () => { if (tip.current) tip.current.style.opacity = "0"; });
    dom.addEventListener("wheel", onWheel, { passive: false });

    let frameId = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      if (!reduce) {
        for (const ring of e.rings) {
          const s = 1 + 0.18 * Math.sin(t * 3.2);
          ring.scale.set(s, s, 1);
        }
      }
      if (e.tween) {
        controls.target.lerp(e.tween.target, reduce ? 1 : 0.14);
        camera.position.lerp(e.tween.pos, reduce ? 1 : 0.14);
        if (camera.position.distanceTo(e.tween.pos) < 0.04 && controls.target.distanceTo(e.tween.target) < 0.04) {
          e.tween = null;
        }
      }
      if (e.roverObj && e.roverGoal) {
        e.roverObj.position.lerp(e.roverGoal, reduce ? 1 : 0.16);
      }
      controls.update();
      updateCompass();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("wheel", onWheel);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      el.replaceChildren();
      env.current = null;
      framedZone.current = "";
    };
  }, []);

  // Build / rebuild block CAD geometry when data or selection/filter changes
  const sceneKey = JSON.stringify([zone, blockLabel, rows, cols, rowM, treeM, filter, selected, soilProfile, plants.map((p) => [p.row, p.col, p.status, p.vision.status, p.vision.badgeLabel, p.plant, p.reached, p.canopy, p.flagged, p.readings.ph, p.readings.moisture])]);
  useEffect(() => {
    const e = env.current;
    if (!e) return;

    const disposeChildren = (grp: THREE.Group) => {
      for (const child of [...grp.children]) {
        grp.remove(child);
        child.traverse((x) => {
          const m = x as THREE.Mesh;
          m.geometry?.dispose();
          (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((mt) => mt.dispose());
          if (x instanceof CSS2DObject) x.element.remove();
        });
      }
    };

    disposeChildren(e.content);
    disposeChildren(e.gridGroup);
    e.rings = [];
    e.hits = [];
    e.plotCenters.clear();

    const W = Math.max(2, cols * treeM);
    const D = Math.max(2, rows * rowM);
    const PAD = 1.6;
    const gridSpan = Math.max(40, Math.ceil(Math.max(W, D) / 10) * 10 + 30);
    const grid = new THREE.GridHelper(gridSpan, gridSpan, C.gridMajor, C.gridMinor);
    grid.position.y = -0.002;
    e.gridGroup.add(grid);

    // Land boundary parcel
    const parcelW = W + PAD * 2;
    const parcelD = D + PAD * 2;
    const parcel = new THREE.Mesh(
      new THREE.PlaneGeometry(parcelW, parcelD),
      new THREE.MeshLambertMaterial({ color: C.parcel }),
    );
    parcel.rotation.x = -Math.PI / 2;
    parcel.position.y = 0.004;
    parcel.receiveShadow = true;
    e.content.add(parcel);

    // Crisp CAD perimeter + subtle inner crop margin
    e.content.add(makeRectLoop(parcelW, parcelD, 0.016, C.boundary, 0.85));
    e.content.add(makeRectLoop(W + 0.4, D + 0.4, 0.014, C.bedEdge, 0.55));

    // Corner CAD datum stakes
    const stakeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8);
    const stakeMat = new THREE.MeshLambertMaterial({ color: C.boundary });
    for (const sx of [-parcelW / 2, parcelW / 2]) {
      for (const sz of [-parcelD / 2, parcelD / 2]) {
        const stake = new THREE.Mesh(stakeGeo, stakeMat);
        stake.position.set(sx, 0.12, sz);
        e.content.add(stake);
      }
    }

    // CAD Dimension lines (width along front +Z, depth along left -X)
    const dimFrontZ = parcelD / 2 + 0.9;
    e.content.add(makeLine([new THREE.Vector3(-W / 2, 0.02, dimFrontZ), new THREE.Vector3(W / 2, 0.02, dimFrontZ)], C.boundary, 0.65));
    e.content.add(makeLine([new THREE.Vector3(-W / 2, 0.02, dimFrontZ - 0.25), new THREE.Vector3(-W / 2, 0.02, dimFrontZ + 0.25)], C.boundary, 0.65));
    e.content.add(makeLine([new THREE.Vector3(W / 2, 0.02, dimFrontZ - 0.25), new THREE.Vector3(W / 2, 0.02, dimFrontZ + 0.25)], C.boundary, 0.65));
    const widthLbl = makeLabel(`${W.toFixed(1)} m`, "cad-dim-lbl");
    widthLbl.position.set(0, 0.06, dimFrontZ + 0.45);
    e.content.add(widthLbl);

    const dimLeftX = -parcelW / 2 - 0.9;
    e.content.add(makeLine([new THREE.Vector3(dimLeftX, 0.02, -D / 2), new THREE.Vector3(dimLeftX, 0.02, D / 2)], C.boundary, 0.65));
    e.content.add(makeLine([new THREE.Vector3(dimLeftX - 0.25, 0.02, -D / 2), new THREE.Vector3(dimLeftX + 0.25, 0.02, -D / 2)], C.boundary, 0.65));
    e.content.add(makeLine([new THREE.Vector3(dimLeftX - 0.25, 0.02, D / 2), new THREE.Vector3(dimLeftX + 0.25, 0.02, D / 2)], C.boundary, 0.65));
    const depthLbl = makeLabel(`${D.toFixed(1)} m`, "cad-dim-lbl");
    depthLbl.position.set(dimLeftX - 0.75, 0.06, 0);
    e.content.add(depthLbl);

    // Raised beds / rows (R1 at front +Z, R2.. behind toward -Z)
    const bedW = Math.max(1, W - treeM * 0.16);
    const bedD = Math.min(rowM * 0.64, Math.max(0.9, rowM - 0.45));
    const bedMat = new THREE.MeshLambertMaterial({ color: C.bed });
    const curbMat = new THREE.MeshLambertMaterial({ color: C.bedEdge });
    const trunkMat = new THREE.MeshLambertMaterial({ color: C.trunk });

    for (let r = 0; r < rows; r++) {
      const zRow = D / 2 - (r + 0.5) * rowM;
      const bed = new THREE.Mesh(new THREE.BoxGeometry(bedW, 0.16, bedD), bedMat);
      bed.position.set(0, 0.08, zRow);
      bed.receiveShadow = true;
      bed.castShadow = true;
      e.content.add(bed);

      const curb = new THREE.Mesh(new THREE.BoxGeometry(bedW + 0.18, 0.05, bedD + 0.18), curbMat);
      curb.position.set(0, 0.025, zRow);
      curb.receiveShadow = true;
      e.content.add(curb);

      const rowTag = makeLabel(`R${r + 1}`, "cad-row-tag");
      rowTag.position.set(-W / 2 - 0.72, 0.22, zRow);
      e.content.add(rowTag);
    }

    // Individual plot pads and plant markers
    const size = Math.min(rowM, treeM);
    const padW = Math.min(treeM * 0.76, Math.max(0.8, treeM - 0.28));
    const padD = Math.min(bedD * 0.84, Math.max(0.7, bedD - 0.2));

    for (const p of plants) {
      const x = -W / 2 + (p.col + 0.5) * treeM;
      const z = D / 2 - (p.row + 0.5) * rowM;
      e.plotCenters.set(`${p.row},${p.col}`, new THREE.Vector3(x, 0.2, z));

      const isPicked = selected?.row === p.row && selected?.col === p.col;
      const dimmed =
        !isPicked &&
        ((filter === "attention" && p.status !== "attention") ||
          (filter === "vision" && p.vision.status !== "alert"));
      const hasAlert = p.status === "attention" || p.vision.status === "alert";
      const opacity = dimmed ? 0.28 : 1;

      const padColor = !p.reached || !p.plant ? C.padUnrecorded : hasAlert ? C.padAttention : C.padOptimal;
      const edgeColor = isPicked ? C.pick : !p.reached || !p.plant ? C.edgeUnrecorded : hasAlert ? C.edgeAttention : C.edgeOptimal;

      const padMesh = new THREE.Mesh(
        new THREE.BoxGeometry(padW, 0.03, padD),
        new THREE.MeshLambertMaterial({ color: padColor, transparent: dimmed, opacity }),
      );
      padMesh.position.set(x, 0.175, z);
      padMesh.receiveShadow = true;
      padMesh.userData = { row: p.row, col: p.col, tip: tipFor(p) };
      e.hits.push(padMesh);
      e.content.add(padMesh);

      const border = makeRectLoop(padW + 0.02, padD + 0.02, 0.194, edgeColor, dimmed ? 0.35 : 0.95);
      border.position.set(x, 0, z);
      e.content.add(border);

      if (!p.reached) {
        const stake = new THREE.Mesh(
          new THREE.CylinderGeometry(size * 0.11, size * 0.13, 0.14, 14),
          new THREE.MeshLambertMaterial({ color: C.markerGray, transparent: dimmed, opacity: dimmed ? 0.3 : 0.85 }),
        );
        stake.position.set(x, 0.26, z);
        stake.userData = { row: p.row, col: p.col, tip: tipFor(p) };
        e.hits.push(stake);
        e.content.add(stake);
      } else if (!p.plant) {
        const emptyRing = new THREE.Mesh(
          new THREE.RingGeometry(size * 0.14, size * 0.21, 20),
          new THREE.MeshBasicMaterial({ color: C.edgeUnrecorded, side: THREE.DoubleSide, transparent: true, opacity: dimmed ? 0.25 : 0.85 }),
        );
        emptyRing.rotation.x = -Math.PI / 2;
        emptyRing.position.set(x, 0.198, z);
        e.content.add(emptyRing);
      } else {
        const scale = Math.max(0.58, Math.min(1.22, (p.canopy ?? 0.34) / 0.34));
        const r = Math.min(size * 0.3, 1.05) * scale;
        const trunkH = Math.max(0.45, Math.min(1.3, size * 0.38));

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.16, trunkH, 8), trunkMat);
        trunk.position.set(x, 0.19 + trunkH / 2, z);
        trunk.castShadow = true;

        const crownColor = hasAlert ? C.leafAttention : p.status === "optimal" ? C.leafOptimal : C.markerGray;
        const crownMat = new THREE.MeshLambertMaterial({ color: crownColor, transparent: dimmed, opacity });
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), crownMat);
        crown.position.set(x, 0.19 + trunkH + r * 0.72, z);
        crown.scale.set(1, 0.84, 1);
        crown.castShadow = true;

        for (const m of [trunk, crown]) {
          m.userData = { row: p.row, col: p.col, tip: tipFor(p) };
          e.hits.push(m);
        }
        e.content.add(trunk, crown);

        if (hasAlert) {
          const alertRing = new THREE.Mesh(
            new THREE.RingGeometry(r * 1.18, r * 1.42, 32),
            new THREE.MeshBasicMaterial({ color: C.edgeAttention, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
          );
          alertRing.rotation.x = -Math.PI / 2;
          alertRing.position.set(x, 0.205, z);
          e.content.add(alertRing);
          e.rings.push(alertRing);
        }

        if (hasAlert || isPicked) {
          const topY = 0.19 + trunkH + r * 1.85;
          const badge = makeLabel(
            `${hasAlert ? `<button type="button" class="cad-bang" data-cad-plot="${p.row}:${p.col}" aria-label="${tipFor(p)}">!</button>` : ""}` +
            `${isPicked ? `<span class="cad-sel-pill">${p.name}</span>` : ""}`,
            "cad-badges",
          );
          badge.position.set(x, topY, z);
          e.content.add(badge);
        }
      }

      if (isPicked) {
        const selRing = new THREE.Mesh(
          new THREE.RingGeometry(Math.min(padW, padD) * 0.4, Math.min(padW, padD) * 0.48, 36),
          new THREE.MeshBasicMaterial({ color: C.pick, side: THREE.DoubleSide }),
        );
        selRing.rotation.x = -Math.PI / 2;
        selRing.position.set(x, 0.208, z);
        e.content.add(selRing);

        const selBox = makeRectLoop(padW + 0.16, padD + 0.16, 0.212, C.pick, 1);
        selBox.position.set(x, 0, z);
        e.content.add(selBox);

        if (!p.reached || !p.plant) {
          const badge = makeLabel(`<span class="cad-sel-pill">${p.name}</span>`, "cad-badges");
          badge.position.set(x, 0.65, z);
          e.content.add(badge);
        }
      }
    }

    // Update default pose and auto-frame when block or dimensions change
    const frameKey = `${zone}|${rows}x${cols}@${rowM}x${treeM}`;
    const pose = computeDefaultPose(rows, cols, rowM, treeM, e.camera.aspect);
    e.defaultPose = pose;
    if (framedZone.current !== frameKey) {
      const immediate = framedZone.current === "";
      framedZone.current = frameKey;
      if (immediate) {
        e.controls.target.copy(pose.target);
        e.camera.position.copy(pose.pos);
        e.controls.update();
        e.renderer.render(e.scene, e.camera);
        e.labels.render(e.scene, e.camera);
      } else {
        e.tween = { target: pose.target.clone(), pos: pose.pos.clone() };
      }
    }
  }, [sceneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus camera gently on selected plot when requested from table click
  useEffect(() => {
    const e = env.current;
    if (!e || !selected || focusSeq === 0) return;
    const pt = e.plotCenters.get(`${selected.row},${selected.col}`);
    if (!pt) return;
    const offset = e.camera.position.clone().sub(e.controls.target);
    const maxFocusDist = Math.max(11, Math.min(22, offset.length()));
    if (offset.length() > maxFocusDist) offset.setLength(maxFocusDist);
    e.tween = {
      target: new THREE.Vector3(pt.x, 0.25, pt.z),
      pos: new THREE.Vector3(pt.x, 0.25, pt.z).add(offset),
    };
  }, [focusSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live rover marker during active round
  useEffect(() => {
    const e = env.current;
    if (!e) return;
    if (!rover) {
      if (e.roverObj) {
        e.scene.remove(e.roverObj);
        e.roverObj.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove(); });
        e.roverObj = null;
      }
      e.roverGoal = null;
      return;
    }
    const W = Math.max(2, cols * treeM);
    const D = Math.max(2, rows * rowM);
    const x = -W / 2 + (rover.col + 0.5) * treeM;
    const z = D / 2 - (rover.row + 0.5) * rowM - rowM * 0.42;

    if (!e.roverObj) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.38, 0.56), new THREE.MeshLambertMaterial({ color: C.rover }));
      body.position.y = 0.48;
      body.castShadow = true;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8), new THREE.MeshLambertMaterial({ color: C.rover }));
      mast.position.set(-0.2, 1.05, 0);
      const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.11, 14);
      const wheelMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
      for (const [wx, wz] of [[0.28, 0.3], [-0.28, 0.3], [0.28, -0.3], [-0.28, -0.3]]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.24, wz);
        g.add(w);
      }
      const tag = makeLabel("Rover", "f3-rover");
      tag.position.set(0, 1.7, 0);
      g.add(body, mast, tag);
      g.position.set(x, 0, z);
      e.scene.add(g);
      e.roverObj = g;
    }
    e.roverGoal = new THREE.Vector3(x, 0, z);
    e.roverObj.rotation.y = -(rover.heading * Math.PI) / 180;
  }, [rover?.row, rover?.col, rover?.heading, rows, cols, rowM, treeM]);

  if (noGl) {
    return (
      <CadFallbackSvg
        blockLabel={blockLabel}
        rows={rows}
        cols={cols}
        rowM={rowM}
        treeM={treeM}
        plants={plants}
        filter={filter}
        selected={selected}
        onSelect={onSelect}
        height={height}
      />
    );
  }

  const areaM2 = cols * treeM * rows * rowM;

  return (
    <div className="cad-wrap" style={{ height }}>
      <div ref={host} className="cad-host" />
      <div ref={tip} className="f3-tip" aria-hidden />

      <div className="cad-hud-top-left">
        <span className="cad-pill">
          <b>{blockLabel}</b> · {(cols * treeM).toFixed(0)} × {(rows * rowM).toFixed(0)} m ({areaM2.toFixed(0)} m²)
        </span>
      </div>

      <button
        type="button"
        className="cad-compass"
        title="Click to reset North orientation"
        aria-label="Compass orientation, click to reset view"
        onClick={resetView}
      >
        <svg viewBox="0 0 44 44" width="40" height="40" aria-hidden>
          <circle cx="22" cy="22" r="19" fill="rgba(255,255,255,0.92)" stroke="#c9d3c4" strokeWidth="1.2" />
          <g ref={compassDial} style={{ transformOrigin: "22px 22px" }}>
            <polygon points="22,6 26,22 22,19 18,22" fill="#2e7d4f" />
            <polygon points="22,38 26,22 22,25 18,22" fill="#9aa49e" />
            <text x="22" y="13.5" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#17261d">N</text>
          </g>
        </svg>
      </button>

      <div className="cad-legend" aria-hidden>
        <span><i className="cad-dot cad-dot-ok" />Optimal</span>
        <span><i className="cad-dot cad-dot-warn" />Needs attention</span>
        <span><i className="cad-dot cad-dot-gray" />Unrecorded / no plant</span>
      </div>

      <div className="cad-hud-controls" role="group" aria-label="3D view controls">
        <span className="cad-hint">Drag to orbit · Right-drag to pan</span>
        <button type="button" className="cad-ctrl-btn" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(0.78)}>
          <Plus size={15} aria-hidden />
        </button>
        <button type="button" className="cad-ctrl-btn" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1.26)}>
          <Minus size={15} aria-hidden />
        </button>
        <button type="button" className="cad-ctrl-btn cad-ctrl-reset" onClick={resetView}>
          <RotateCcw size={13} aria-hidden />Reset view
        </button>
      </div>
    </div>
  );
}
