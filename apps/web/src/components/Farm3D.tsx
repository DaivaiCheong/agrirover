import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

/** What a tree needs: "look" is a problem to go and see, "ok" an expected sign (stress yellowing), null nothing. */
export type TreeAlert = "look" | "expected" | null;
export type Tree3D = { row: number; col: number; plant: boolean; reached?: boolean; canopy?: number | null; yellow?: boolean;
  alert?: TreeAlert; note?: string; photo?: boolean };
export type Block3D = { zone: string; label: string; rows: number; cols: number; rowM: number; treeM: number; trees: Tree3D[] };
export type TreeRef = { zone: string; row: number; col: number };

const GAP = 6;                     // metres between blocks
const C = {
  ground: 0xe9eedf, soil: 0xb79f78, soilEdge: 0x9c845d, bare: 0xd8c9ad, trunk: 0x6b4a2f,
  leaf: 0x3f8f4f, leafYellow: 0xc8b23c, pending: 0xc9d1c3, ring: 0xd9902a, pick: 0x1f5c39, rover: 0x17261d,
};

const treeName = (row: number, col: number) => `R${row + 1} T${col + 1}`;

/** Where each block sits: at real size in metres, in rows like a farm seen from the gate, the whole farm centred on the
 *  origin. A row is about as wide as the farm is deep, so the whole-farm view stays close. `z0` is the block's front edge. */
function layout(blocks: Block3D[]) {
  const sized = blocks.map((b) => ({ w: b.cols * b.treeM, d: b.rows * b.rowM }));
  const area = sized.reduce((s, b) => s + (b.w + GAP) * (b.d + GAP), 0);
  const rowWidth = Math.max(Math.sqrt(area) * 1.5, ...sized.map((b) => b.w));
  const out: { x0: number; z0: number; w: number; d: number }[] = [];
  let x = 0, z = 0, depth = 0;
  for (const b of sized) {
    if (x > 0 && x + b.w > rowWidth) { x = 0; z -= depth + GAP; depth = 0; }
    out.push({ x0: x, z0: z, ...b });
    x += b.w + GAP;
    depth = Math.max(depth, b.d);
  }
  const minX = 0, maxX = Math.max(...out.map((o) => o.x0 + o.w)), maxZ = 0, minZ = Math.min(...out.map((o) => o.z0 - o.d));
  const dx = -(minX + maxX) / 2, dz = -(minZ + maxZ) / 2;
  return out.map((o) => ({ ...o, x0: o.x0 + dx, z0: o.z0 + dz }));
}

function label(html: string, cls: string): CSS2DObject {
  const el = document.createElement("div");
  el.className = cls;
  el.innerHTML = html;
  return new CSS2DObject(el);
}

/** The farm in 3D: every block at its real size, every tree the rover read, problem trees marked and clickable.
 *  Drag to turn, scroll to zoom, click a tree to pick it. The "!" badges are buttons too, so a keyboard can reach them. */
export default function Farm3D({ blocks, selected, onPick, focus, rover, height = 440 }: {
  blocks: Block3D[]; selected?: TreeRef | null; onPick?: (t: TreeRef) => void;
  /** a block to frame, or null for the whole farm */ focus?: string | null;
  /** where the rover is, during a round */ rover?: { zone: string; row: number; col: number; heading: number } | null;
  height?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const env = useRef<{
    renderer: THREE.WebGLRenderer; labels: CSS2DRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    content: THREE.Group; rings: THREE.Mesh[]; hits: THREE.Object3D[]; roverObj: THREE.Group | null; roverGoal: THREE.Vector3 | null;
    tween: { target: THREE.Vector3; pos: THREE.Vector3 } | null; boxes: Map<string, THREE.Box3>; farmBox: THREE.Box3;
  } | null>(null);
  const [noGl, setNoGl] = useState(false);
  const framed = useRef(false);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  // with one block in view, the other blocks' tags would float over the controls: show only the block in focus
  const showTags = (e: { content: THREE.Group }) => {
    for (const g of e.content.children) {
      const shown = !focusRef.current || g.userData.zone === focusRef.current;
      g.traverse((o) => { if (o instanceof CSS2DObject) o.element.style.visibility = shown ? "" : "hidden"; });
    }
  };

  // the scene, camera, controls and render loop: made once
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
    labels.domElement.className = "f3-labels";
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f5f0);
    scene.fog = new THREE.Fog(0xf3f5f0, 140, 260);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
    camera.position.set(20, 45, 70);
    const controls = new OrbitControls(camera, labels.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = 1.38;                    // never under the ground
    controls.minDistance = 6;
    controls.maxDistance = 220;
    controls.screenSpacePanning = false;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-40, 70, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 220 });
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: C.ground }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const content = new THREE.Group();
    scene.add(content);

    const e = { renderer, labels, scene, camera, controls, content, rings: [] as THREE.Mesh[], hits: [] as THREE.Object3D[],
      roverObj: null as THREE.Group | null, roverGoal: null as THREE.Vector3 | null, tween: null as { target: THREE.Vector3; pos: THREE.Vector3 } | null,
      boxes: new Map<string, THREE.Box3>(), farmBox: new THREE.Box3() };
    env.current = e;
    controls.addEventListener("start", () => { e.tween = null; });   // a person turning the view wins over a camera move

    const size = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      labels.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);

    // a click is a press and release without a drag; a drag turns the view
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let down: [number, number] | null = null;
    const hit = (ev: PointerEvent) => {
      const r = labels.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(e.hits, false)[0]?.object.userData as (TreeRef & { tip: string }) | undefined;
    };
    const onDown = (ev: PointerEvent) => { down = [ev.clientX, ev.clientY]; };
    const onUp = (ev: PointerEvent) => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 6) { down = null; return; }
      down = null;
      // the view's controls hold the pointer, so a badge never gets its own click: look for one under the pointer first
      const badge = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-tree]");
      if (badge) {
        const [zone, row, col] = badge.dataset.tree!.split(":");
        pickRef.current?.({ zone, row: Number(row), col: Number(col) });
        return;
      }
      const t = hit(ev);
      if (t) pickRef.current?.({ zone: t.zone, row: t.row, col: t.col });
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons) return;
      const t = hit(ev);
      labels.domElement.style.cursor = t ? "pointer" : "grab";
      const box = tip.current;
      if (!box) return;
      if (t) {
        const r = el.getBoundingClientRect();
        box.textContent = t.tip;
        box.style.transform = `translate(${ev.clientX - r.left + 14}px, ${ev.clientY - r.top + 14}px)`;
        box.style.opacity = "1";
      } else box.style.opacity = "0";
    };
    const dom = labels.domElement;
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", () => { if (tip.current) tip.current.style.opacity = "0"; });

    let frame = 0;
    const clock = new THREE.Clock();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      if (!reduce) for (const r of e.rings) { const s = 1 + 0.25 * Math.sin(t * 3); r.scale.set(s, s, 1); }
      if (e.tween) {
        controls.target.lerp(e.tween.target, 0.12);
        camera.position.lerp(e.tween.pos, 0.12);
        if (camera.position.distanceTo(e.tween.pos) < 0.05) e.tween = null;
      }
      if (e.roverObj && e.roverGoal) e.roverObj.position.lerp(e.roverGoal, reduce ? 1 : 0.15);
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
      el.replaceChildren();
      env.current = null;
      framed.current = false;
    };
  }, []);

  // the blocks and trees: rebuilt when the data changes, the camera stays where the person left it
  const key = JSON.stringify([blocks, selected]);
  useEffect(() => {
    const e = env.current;
    if (!e) return;
    for (const o of [...e.content.children]) {
      e.content.remove(o);
      o.traverse((x) => {
        const m = x as THREE.Mesh;
        m.geometry?.dispose();
        if (x instanceof CSS2DObject) x.element.remove();
      });
    }
    e.rings = [];
    e.hits = [];
    e.boxes.clear();
    e.farmBox.makeEmpty();

    const mat = {
      soil: new THREE.MeshLambertMaterial({ color: C.soil }), edge: new THREE.MeshLambertMaterial({ color: C.soilEdge }),
      bare: new THREE.MeshLambertMaterial({ color: C.bare }), trunk: new THREE.MeshLambertMaterial({ color: C.trunk }),
      leaf: new THREE.MeshLambertMaterial({ color: C.leaf }), yellow: new THREE.MeshLambertMaterial({ color: C.leafYellow }),
      pending: new THREE.MeshLambertMaterial({ color: C.pending, transparent: true, opacity: 0.6 }),
      ring: new THREE.MeshBasicMaterial({ color: C.ring, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      pick: new THREE.MeshBasicMaterial({ color: C.pick, side: THREE.DoubleSide }),
    };
    const at = layout(blocks);
    blocks.forEach((b, i) => {
      const { x0, z0, w, d } = at[i];
      const g = new THREE.Group();
      g.userData.zone = b.zone;
      g.position.set(x0, 0, z0);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), mat.soil);
      bed.position.set(w / 2, 0.15, -d / 2);
      bed.receiveShadow = true;
      g.add(bed);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.12, d + 0.6), mat.edge);
      lip.position.set(w / 2, 0.06, -d / 2);
      g.add(lip);
      const looks = b.trees.filter((t) => t.alert === "look").length;
      const name = label(`<b>${b.label}</b>${looks ? `<span class="f3-count">${looks} to look at</span>` : ""}`, "f3-block");
      name.position.set(w / 2, 0.4, 1.4);
      g.add(name);
      const size = Math.min(b.treeM, b.rowM);
      for (const t of b.trees) {
        const x = (t.col + 0.5) * b.treeM, z = -(t.row + 0.5) * b.rowM;
        const tipText = `${b.label} · ${treeName(t.row, t.col)}${t.note ? ` · ${t.note}` : ""}`;
        if (t.reached === false) {
          const dot = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.12, 0.05, 16), mat.pending);
          dot.position.set(x, 0.33, z);
          g.add(dot);
          continue;
        }
        if (!t.plant) {
          const pad = new THREE.Mesh(new THREE.BoxGeometry(b.treeM * 0.8, 0.04, b.rowM * 0.8), mat.bare);
          pad.position.set(x, 0.32, z);
          g.add(pad);
          continue;
        }
        const scale = Math.max(0.55, Math.min(1.25, (t.canopy ?? 0.32) / 0.32));
        const r = size * 0.32 * scale;
        const trunkH = Math.max(0.6, size * 0.45);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.12, r * 0.16, trunkH, 8), mat.trunk);
        trunk.position.set(x, 0.3 + trunkH / 2, z);
        trunk.castShadow = true;
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), t.yellow ? mat.yellow : mat.leaf);
        crown.position.set(x, 0.3 + trunkH + r * 0.75, z);
        crown.scale.set(1, 0.85, 1);
        crown.castShadow = true;
        for (const m of [trunk, crown]) {
          m.userData = { zone: b.zone, row: t.row, col: t.col, tip: tipText };
          e.hits.push(m);
        }
        g.add(trunk, crown);
        const picked = selected?.zone === b.zone && selected.row === t.row && selected.col === t.col;
        if (picked) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.05, r * 1.3, 40), mat.pick);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(x, 0.34, z);
          g.add(ring);
        }
        if (t.alert === "look") {
          const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.35, r * 1.6, 40), mat.ring);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(x, 0.33, z);
          g.add(ring);
          e.rings.push(ring);
        }
        if (t.alert || t.photo || picked) {
          const badge = label(
            `${t.alert === "look" ? `<button type="button" class="f3-bang" data-tree="${b.zone}:${t.row}:${t.col}" aria-label="${tipText}">!</button>` : ""}`
            + `${t.alert === "expected" ? `<span class="f3-ok" title="${tipText}">i</span>` : ""}`
            + `${t.photo ? `<span class="f3-photo" title="Photo saved"></span>` : ""}`
            + `${picked ? `<span class="f3-name">${treeName(t.row, t.col)}</span>` : ""}`, "f3-badges");
          badge.position.set(x, 0.3 + trunkH + r * 2.1, z);
          badge.element.querySelector("button")?.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pickRef.current?.({ zone: b.zone, row: t.row, col: t.col }); }
          });
          g.add(badge);
        }
      }
      e.content.add(g);
      const box = new THREE.Box3(new THREE.Vector3(x0, 0, z0 - d), new THREE.Vector3(x0 + w, 3, z0));
      e.boxes.set(b.zone, box);
      e.farmBox.union(box);
    });
    showTags(e);
  }, [key]);    // eslint-disable-line react-hooks/exhaustive-deps

  // frame a block, or the whole farm, when asked
  const frameKey = `${focus ?? ""}|${blocks.map((b) => `${b.zone}${b.rows}x${b.cols}`).join()}`;
  useEffect(() => {
    const e = env.current;
    if (!e || e.farmBox.isEmpty()) return;
    showTags(e);
    const box = (focus && e.boxes.get(focus)) || e.farmBox;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    // fit the block's footprint, seen at an angle, inside the narrower of the two viewing angles
    const span = Math.max(Math.hypot(s.x, s.z), 8);
    const half = Math.atan(Math.tan((e.camera.fov * Math.PI) / 360) * Math.min(1, e.camera.aspect));
    const dist = (span / 2) / Math.tan(half) * 1.3;           // perspective: the near corners need room
    const dir = new THREE.Vector3(0.12, 0.9, 1).normalize();
    const goal = { target: c.clone(), pos: c.clone().add(dir.multiplyScalar(dist)) };
    if (!framed.current) {            // the first view is set at once: it must not wait on animation frames
      framed.current = true;
      e.controls.target.copy(goal.target);
      e.camera.position.copy(goal.pos);
      e.controls.update();
      e.renderer.render(e.scene, e.camera);
      e.labels.render(e.scene, e.camera);
    } else e.tween = goal;
  }, [frameKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the rover, during a round
  useEffect(() => {
    const e = env.current;
    if (!e) return;
    const i = rover ? blocks.findIndex((b) => b.zone === rover.zone) : -1;
    if (!rover || i < 0) {
      if (e.roverObj) {
        e.scene.remove(e.roverObj);
        e.roverObj.traverse((o) => { if (o instanceof CSS2DObject) o.element.remove(); });   // its tag is a page element, not a mesh
        e.roverObj = null;
      }
      return;
    }
    const b = blocks[i];
    const at = layout(blocks)[i];
    const x = at.x0 + (rover.col + 0.5) * b.treeM;
    const z = at.z0 - (rover.row + 0.5) * b.rowM - b.rowM * 0.5;      // in the lane beside the tree
    if (!e.roverObj) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.6), new THREE.MeshLambertMaterial({ color: C.rover }));
      body.position.y = 0.55;
      body.castShadow = true;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), new THREE.MeshLambertMaterial({ color: C.rover }));
      mast.position.set(-0.2, 1.2, 0);
      const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14);
      const wm = new THREE.MeshLambertMaterial({ color: 0x333333 });
      for (const [wx, wz] of [[0.3, 0.33], [-0.3, 0.33], [0.3, -0.33], [-0.3, -0.33]]) {
        const w = new THREE.Mesh(wheel, wm);
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.3, wz);
        g.add(w);
      }
      const tag = label("Rover", "f3-rover");
      tag.position.set(0, 1.9, 0);
      g.add(body, mast, tag);
      g.position.set(x, 0, z);
      e.scene.add(g);
      e.roverObj = g;
    }
    e.roverGoal = new THREE.Vector3(x, 0, z);
    e.roverObj.rotation.y = -(rover.heading * Math.PI) / 180;
  }, [rover?.zone, rover?.row, rover?.col, rover?.heading, blocks.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (noGl) return <p className="small muted">This browser cannot draw 3D. Use the map view.</p>;
  return (
    <div className="f3" style={{ height }}>
      <div ref={host} className="f3-host" />
      <div ref={tip} className="f3-tip" aria-hidden />
    </div>
  );
}
