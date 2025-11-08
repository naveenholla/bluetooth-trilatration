
import { WallMaterial } from './types';

type WallMaterialProperties = {
  attenuation: number;
  color: number;
  name: string;
};

export const WALL_MATERIALS: Record<WallMaterial, WallMaterialProperties> = {
    drywall:    { attenuation: 3,  color: 0xcccccc, name: 'Drywall' },
    concrete:   { attenuation: 10, color: 0x888888, name: 'Concrete' },
    brick:      { attenuation: 8,  color: 0xaa6644, name: 'Brick' },
    glass:      { attenuation: 2,  color: 0x8888ff, name: 'Glass' },
    metal:      { attenuation: 20, color: 0x666666, name: 'Metal' },
    door_wood:  { attenuation: 4,  color: 0x996633, name: 'Wood Door' },
    door_metal: { attenuation: 12, color: 0x555555, name: 'Metal Door' }
};

export const CANVAS_WIDTH = 1200;
export const CANVAS_HEIGHT = 900;
export const PIXELS_PER_METER = 40;
