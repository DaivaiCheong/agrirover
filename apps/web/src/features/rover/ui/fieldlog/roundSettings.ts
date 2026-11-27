// Per-block settings for a round: set on the Setup tab, read when a round starts. Kept on this device, under the same keys
// the old Rover page used, so a block's settings survive the redesign.

import { routeKey, type Route } from "../../../../lib/rover";

export type CameraMode = "left" | "right" | "side";
export const CAMERA: Record<CameraMode, string> = {
  left: "Forward: turn left to look", right: "Forward: turn right to look", side: "Sideways: no turn",
};

const cameraKey = (zone: string) => `agrirover.camera.${zone}`;
const inspectKey = (zone: string) => `agrirover.inspect.${zone}`;

export function savedCamera(zone: string): CameraMode {
  const x = localStorage.getItem(cameraKey(zone));
  return x === "left" || x === "right" || x === "side" ? x : "left";
}
export const setCamera = (zone: string, c: CameraMode) => localStorage.setItem(cameraKey(zone), c);

/** Plant Inspection: the rover photographs every tree on a round. On unless switched off. */
export const savedInspect = (zone: string) => localStorage.getItem(inspectKey(zone)) !== "off";
export const setInspect = (zone: string, on: boolean) => localStorage.setItem(inspectKey(zone), on ? "on" : "off");

export const setRoute = (zone: string, r: Route) => localStorage.setItem(routeKey(zone), JSON.stringify(r));
