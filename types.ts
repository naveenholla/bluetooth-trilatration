
export interface Vector2D {
  x: number;
  y: number;
}

export type WallMaterial = 'drywall' | 'concrete' | 'brick' | 'glass' | 'metal' | 'door_wood' | 'door_metal';

export interface Wall {
  id: string;
  start: Vector2D;
  end: Vector2D;
  material: WallMaterial;
  attenuation: number;
  color: number;
}

export interface Radio extends Vector2D {
  id: string;
  radius: number;
  label: string;
}

export interface Device extends Vector2D {
  radius: number;
}

export interface Measurement {
  radio: Radio;
  trueDistance: number;
  rssi: number;
  estimatedDistance: number;
}

export interface Intersection {
  point: Vector2D;
  wall: Wall;
}

export interface DragObject {
  type: 'radio' | 'device';
  target: Radio | Device;
  offset: Vector2D;
}
