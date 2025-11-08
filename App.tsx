import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Vector2D, Wall, WallMaterial, Radio, Device, Measurement, Intersection, DragObject } from './types';
import { WALL_MATERIALS, CANVAS_WIDTH, CANVAS_HEIGHT, PIXELS_PER_METER } from './constants';
import Sidebar, { SidebarSection, ControlGroup } from './components/Sidebar';
import Slider from './components/Slider';

// Declare THREE and cv to be available on the window object
declare const window: any;
declare const THREE: any;
declare const cv: any;

// --- UTILITY FUNCTIONS ---
const generateId = () => '_' + Math.random().toString(36).substr(2, 9);
const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);
const distance = (p1: Vector2D, p2: Vector2D) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

const getMousePos = (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent): Vector2D => {
    const canvas = e.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
};


const App: React.FC = () => {
    // --- STATE ---
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const threeRef = useRef<any>({}); // To hold Three.js objects
    const [opencvReady, setOpencvReady] = useState(false);
    
    // Simulation parameters
    const [numRadios, setNumRadios] = useState(4);
    const [txPower, setTxPower] = useState(-59);
    const [pathLossExponent, setPathLossExponent] = useState(2.7);
    const [minRSSI, setMinRSSI] = useState(-100);
    const [enableNoise, setEnableNoise] = useState(false);
    const [noiseStdDev, setNoiseStdDev] = useState(5);
    const [enableWalls, setEnableWalls] = useState(true);
    const [enableAngleEffect, setEnableAngleEffect] = useState(true);
    const [enableCumulativeEffect, setEnableCumulativeEffect] = useState(true);

    // Scene objects
    const [radios, setRadios] = useState<Radio[]>([]);
    const [walls, setWalls] = useState<Wall[]>([]);
    const [device, setDevice] = useState<Device>({ x: CANVAS_WIDTH / 2 + 50, y: CANVAS_HEIGHT / 2 + 50, radius: 10 });
    const [estimatedPosition, setEstimatedPosition] = useState<Vector2D | null>(null);
    const [measurements, setMeasurements] = useState<Measurement[]>([]);

    // Interaction state
    const draggingRef = useRef<DragObject | null>(null);
    const [drawWallMode, setDrawWallMode] = useState(false);
    const tempWallStartRef = useRef<any | null>(null);

    // Floor plan
    const floorPlanRef = useRef<{ image: HTMLImageElement | null; texture: any; mesh: any; opacity: number; show: boolean }>({
        image: null,
        texture: null,
        mesh: null,
        opacity: 0.5,
        show: false
    });
    const [floorPlanOpacity, setFloorPlanOpacity] = useState(0.5);
    const [showFloorPlan, setShowFloorPlan] = useState(false);

    // Wall detection
    const [wallDetectionMaterial, setWallDetectionMaterial] = useState<WallMaterial>('drywall');


    // --- OPENCV LOADING ---
    useEffect(() => {
        const checkOpenCv = () => {
            if (window.cv) {
                setOpencvReady(true);
            } else {
                setTimeout(checkOpenCv, 50);
            }
        };
        checkOpenCv();
    }, []);

    // --- INITIALIZATION ---
    const initializeScene = useCallback(() => {
        const { current: canvas } = canvasRef;
        if (!canvas || !window.THREE) return;
        
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a202c); // gray-900

        const camera = new THREE.OrthographicCamera(-CANVAS_WIDTH / 2, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, -CANVAS_HEIGHT / 2, 0.1, 1000);
        camera.position.z = 10;
        
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setSize(CANVAS_WIDTH, CANVAS_HEIGHT);
        renderer.setPixelRatio(window.devicePixelRatio);

        threeRef.current = {
            scene, camera, renderer,
            gridGroup: new THREE.Group(),
            wallsGroup: new THREE.Group(),
            radiosGroup: new THREE.Group(),
            deviceGroup: new THREE.Group(),
            circlesGroup: new THREE.Group(),
            estimatedGroup: new THREE.Group(),
            floorPlanGroup: new THREE.Group(),
            tempWallGroup: new THREE.Group(),
            interactiveObjects: [],
        };

        scene.add(threeRef.current.gridGroup, threeRef.current.wallsGroup, threeRef.current.radiosGroup,
                  threeRef.current.deviceGroup, threeRef.current.circlesGroup, threeRef.current.estimatedGroup,
                  threeRef.current.floorPlanGroup, threeRef.current.tempWallGroup);

        createGrid();
    }, []);
    
    const createGrid = useCallback(() => {
        const { gridGroup } = threeRef.current;
        if (!gridGroup) return;
        disposeGroup(gridGroup);
        const color = 0x2d3748; // gray-700
        for (let i = -CANVAS_WIDTH / 2; i <= CANVAS_WIDTH / 2; i += PIXELS_PER_METER) {
            const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i, -CANVAS_HEIGHT/2, 0), new THREE.Vector3(i, CANVAS_HEIGHT/2, 0)]);
            gridGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })));
        }
        for (let i = -CANVAS_HEIGHT / 2; i <= CANVAS_HEIGHT / 2; i += PIXELS_PER_METER) {
            const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-CANVAS_WIDTH/2, i, 0), new THREE.Vector3(CANVAS_WIDTH/2, i, 0)]);
            gridGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })));
        }
    }, []);

    const initializeRadios = useCallback((count: number) => {
        const newRadios: Radio[] = [];
        const margin = 50;
        const width = CANVAS_WIDTH;
        const height = CANVAS_HEIGHT;

        if (count === 3) {
            newRadios.push({ id: generateId(), x: width / 2, y: margin, radius: 10, label: 'R1' });
            newRadios.push({ id: generateId(), x: margin, y: height - margin, radius: 10, label: 'R2' });
            newRadios.push({ id: generateId(), x: width - margin, y: height - margin, radius: 10, label: 'R3' });
        } else if (count === 4) {
             newRadios.push({ id: generateId(), x: margin, y: margin, radius: 10, label: 'R1' });
             newRadios.push({ id: generateId(), x: width-margin, y: margin, radius: 10, label: 'R2' });
             newRadios.push({ id: generateId(), x: width-margin, y: height-margin, radius: 10, label: 'R3' });
             newRadios.push({ id: generateId(), x: margin, y: height-margin, radius: 10, label: 'R4' });
        } else {
             const centerX = width/2;
             const centerY = height/2;
             const radius = Math.min(width, height)/2 - margin;
             for (let i = 0; i < count; i++) {
                 const angle = (i * 2*Math.PI / count) - Math.PI/2;
                 newRadios.push({
                     id: generateId(),
                     x: centerX + radius * Math.cos(angle),
                     y: centerY + radius * Math.sin(angle),
                     radius: 10,
                     label: `R${i+1}`
                 });
             }
        }
        setRadios(newRadios);
    }, []);

    const resetWalls = useCallback(() => {
        const newWalls: Wall[] = [];
        const material: WallMaterial = 'concrete';
        const props = WALL_MATERIALS[material];

        newWalls.push({id: generateId(), start: {x: 300, y: 200}, end: {x: 300, y: 700}, material, attenuation: props.attenuation, color: props.color});
        newWalls.push({id: generateId(), start: {x: 900, y: 200}, end: {x: 900, y: 700}, material, attenuation: props.attenuation, color: props.color});
        newWalls.push({id: generateId(), start: {x: 300, y: 450}, end: {x: 600, y: 450}, material, attenuation: props.attenuation, color: props.color});
        setWalls(newWalls);
    }, []);

    useEffect(() => {
        initializeScene();
        initializeRadios(numRadios);
        resetWalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initializeScene]);
    
    useEffect(() => {
        initializeRadios(numRadios);
    }, [numRadios, initializeRadios]);

    // --- CORE ALGORITHMS ---
    const calculateRSSI = useCallback((distanceMeters: number, transmitter: Radio, receiver: Device) => {
        if (distanceMeters <= 0) return -30;
        let rssi = txPower - 10 * pathLossExponent * Math.log10(distanceMeters);

        if (enableWalls) {
            const intersections = findWallIntersections(transmitter, receiver, walls);
            let totalAttenuation = 0;
            intersections.forEach((intersection, i) => {
                let wallLoss = intersection.wall.attenuation;
                if(enableAngleEffect) {
                    const wallVec = { x: intersection.wall.end.x - intersection.wall.start.x, y: intersection.wall.end.y - intersection.wall.start.y };
                    const wallNormal = { x: -wallVec.y, y: wallVec.x };
                    const signalVec = { x: receiver.x - transmitter.x, y: receiver.y - transmitter.y };
                    const dot = signalVec.x * wallNormal.x + signalVec.y * wallNormal.y;
                    const magSignal = Math.sqrt(signalVec.x**2 + signalVec.y**2);
                    const magNormal = Math.sqrt(wallNormal.x**2 + wallNormal.y**2);
                    const cosTheta = dot / (magSignal * magNormal);
                    const angleFactor = 0.5 + 0.5 * Math.abs(cosTheta);
                    wallLoss *= angleFactor;
                }
                if(enableCumulativeEffect && i > 0) {
                    wallLoss *= Math.pow(1.1, i);
                }
                totalAttenuation += wallLoss;
            });
            rssi -= totalAttenuation;
        }

        if (enableNoise) {
            const u1 = Math.random();
            const u2 = Math.random();
            const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            rssi += z0 * noiseStdDev;
        }
        return clamp(rssi, -120, -30);
    }, [txPower, pathLossExponent, enableWalls, walls, enableNoise, noiseStdDev, enableAngleEffect, enableCumulativeEffect]);
    
    const estimateDistanceFromRSSI = useCallback((rssi: number) => {
        const exponent = (txPower - rssi) / (10 * pathLossExponent);
        return Math.pow(10, exponent);
    }, [txPower, pathLossExponent]);

    const findWallIntersections = (p1: Vector2D, p2: Vector2D, currentWalls: Wall[]): Intersection[] => {
        const intersections: Intersection[] = [];
        for (const wall of currentWalls) {
            const p3 = wall.start;
            const p4 = wall.end;
            const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
            if (den === 0) continue;
            const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
            const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
            if (t > 0 && t < 1 && u > 0 && u < 1) {
                intersections.push({
                    point: { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) },
                    wall
                });
            }
        }
        return intersections;
    };
    
    const performTrilateration = useCallback((activeMeasurements: Measurement[]) => {
        if (activeMeasurements.length < 3) return null;
        
        // Initial guess: weighted centroid
        let totalWeight = 0;
        let initialGuess = activeMeasurements.reduce((acc, m) => {
            const weight = 1 / m.estimatedDistance;
            totalWeight += weight;
            return { x: acc.x + m.radio.x * weight, y: acc.y + m.radio.y * weight };
        }, {x: 0, y: 0});
        initialGuess = { x: initialGuess.x / totalWeight, y: initialGuess.y / totalWeight };

        let pos = { ...initialGuess };
        const maxIterations = 50;
        const convergenceThreshold = 0.1;

        for (let iter = 0; iter < maxIterations; iter++) {
            let J = [];
            let r = [];
            for (const m of activeMeasurements) {
                const radioPos = { x: m.radio.x, y: m.radio.y };
                const dist = distance(pos, radioPos);
                if (dist < 1e-6) continue;
                J.push([(pos.x - radioPos.x) / dist, (pos.y - radioPos.y) / dist]);
                r.push(dist - m.estimatedDistance * PIXELS_PER_METER);
            }
            if (J.length < 2) return pos;

            const Jt = [[], []];
            for (let i = 0; i < J.length; i++) {
                Jt[0].push(J[i][0]);
                Jt[1].push(J[i][1]);
            }
            
            const JtJ = [[0, 0], [0, 0]];
            JtJ[0][0] = J.reduce((sum, row) => sum + row[0] * row[0], 0);
            JtJ[0][1] = J.reduce((sum, row) => sum + row[0] * row[1], 0);
            JtJ[1][0] = JtJ[0][1];
            JtJ[1][1] = J.reduce((sum, row) => sum + row[1] * row[1], 0);

            const det = JtJ[0][0] * JtJ[1][1] - JtJ[0][1] * JtJ[1][0];
            if (Math.abs(det) < 1e-9) break;

            const invDet = 1 / det;
            const JtJ_inv = [[invDet * JtJ[1][1], -invDet * JtJ[0][1]], [-invDet * JtJ[1][0], invDet * JtJ[0][0]]];

            const Jtr = [0, 0];
            for (let i = 0; i < J.length; i++) {
                Jtr[0] += J[i][0] * r[i];
                Jtr[1] += J[i][1] * r[i];
            }

            const delta = [
                -(JtJ_inv[0][0] * Jtr[0] + JtJ_inv[0][1] * Jtr[1]),
                -(JtJ_inv[1][0] * Jtr[0] + JtJ_inv[1][1] * Jtr[1])
            ];

            pos.x += delta[0];
            pos.y += delta[1];

            if (Math.sqrt(delta[0]**2 + delta[1]**2) < convergenceThreshold) break;
        }
        return pos;
    }, []);

    // --- RENDER & UPDATE LOGIC ---
    const canvasToThree = (p: Vector2D): Vector2D => ({ x: p.x - CANVAS_WIDTH / 2, y: -(p.y - CANVAS_HEIGHT / 2) });
    const disposeGroup = (group: any) => {
        while (group.children.length > 0) {
            const object = group.children[0];
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                if (Array.isArray(object.material)) {
                    object.material.forEach((m: any) => m.dispose());
                } else {
                    object.material.dispose();
                }
            }
            group.remove(object);
        }
    };
    
    const updateScene = useCallback(() => {
        const { radiosGroup, deviceGroup, wallsGroup, circlesGroup, estimatedGroup, tempWallGroup, scene } = threeRef.current;
        if (!scene) return;
        
        threeRef.current.interactiveObjects = [];
        
        // Update Radios
        disposeGroup(radiosGroup);
        radios.forEach(radio => {
            const pos = canvasToThree(radio);
            const geo = new THREE.CircleGeometry(radio.radius, 32);
            const mat = new THREE.MeshBasicMaterial({ color: 0x4ade80 }); // green-400
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pos.x, pos.y, 3);
            mesh.userData = { type: 'radio', target: radio };
            radiosGroup.add(mesh);
            threeRef.current.interactiveObjects.push(mesh);
        });

        // Update Device
        disposeGroup(deviceGroup);
        const devPos = canvasToThree(device);
        const devGeo = new THREE.CircleGeometry(device.radius, 32);
        const devMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 }); // sky-400
        const devMesh = new THREE.Mesh(devGeo, devMat);
        devMesh.position.set(devPos.x, devPos.y, 3);
        devMesh.userData = { type: 'device', target: device };
        deviceGroup.add(devMesh);
        threeRef.current.interactiveObjects.push(devMesh);

        // Update Walls
        disposeGroup(wallsGroup);
        walls.forEach(wall => {
            const start = canvasToThree(wall.start);
            const end = canvasToThree(wall.end);
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(start.x, start.y, 2), new THREE.Vector3(end.x, end.y, 2)]);
            const mat = new THREE.LineBasicMaterial({ color: wall.color, linewidth: 3 });
            wallsGroup.add(new THREE.Line(geo, mat));
        });

        // Update Temp Wall
        disposeGroup(tempWallGroup);
        if (drawWallMode && tempWallStartRef.current) {
            const currentMousePos = tempWallStartRef.current.end; // End is updated on mouse move
            if (currentMousePos) {
                 const start = canvasToThree(tempWallStartRef.current.start);
                 const end = canvasToThree(currentMousePos);
                 const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(start.x, start.y, 4), new THREE.Vector3(end.x, end.y, 4)]);
                 const mat = new THREE.LineDashedMaterial({ color: 0xfb923c, dashSize: 5, gapSize: 3, linewidth: 2 });
                 const line = new THREE.Line(geo, mat);
                 line.computeLineDistances();
                 tempWallGroup.add(line);
            }
        }
        
        // Update measurements and circles
        const newMeasurements = radios.map(radio => {
            const trueDistPixels = distance(radio, device);
            const trueDistMeters = trueDistPixels / PIXELS_PER_METER;
            const rssi = calculateRSSI(trueDistMeters, radio, device);
            const estimatedDistMeters = estimateDistanceFromRSSI(rssi);
            return { radio, trueDistance: trueDistMeters, rssi, estimatedDistance: estimatedDistMeters };
        });
        setMeasurements(newMeasurements);
        
        disposeGroup(circlesGroup);
        const activeMeasurements = newMeasurements.filter(m => m.rssi > minRSSI);
        activeMeasurements.forEach(m => {
            const pos = canvasToThree(m.radio);
            const radius = m.estimatedDistance * PIXELS_PER_METER;
            const colorVal = clamp((m.rssi + 100) / 40, 0, 1);
            const color = new THREE.Color().setHSL(0.33 * colorVal, 0.8, 0.5);
            
            const geo = new THREE.RingGeometry(radius - 1, radius, 64);
            const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pos.x, pos.y, 1);
            circlesGroup.add(mesh);
        });
        
        // Update Estimated Position
        const newEstimatedPos = performTrilateration(activeMeasurements);
        setEstimatedPosition(newEstimatedPos);

        disposeGroup(estimatedGroup);
        if (newEstimatedPos) {
            const pos = canvasToThree(newEstimatedPos);
            const geo = new THREE.CircleGeometry(8, 32);
            const mat = new THREE.MeshBasicMaterial({ color: 0xf43f5e }); // rose-500
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pos.x, pos.y, 2);
            estimatedGroup.add(mesh);
            
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(devPos.x, devPos.y, 2.5),
                new THREE.Vector3(pos.x, pos.y, 2.5)
            ]);
            const lineMat = new THREE.LineDashedMaterial({ color: 0xf43f5e, dashSize: 5, gapSize: 3 });
            const line = new THREE.Line(lineGeo, lineMat);
            line.computeLineDistances();
            estimatedGroup.add(line);
        }

        // Update Floor Plan
        disposeGroup(threeRef.current.floorPlanGroup);
        if(floorPlanRef.current.show && floorPlanRef.current.texture) {
            const geo = new THREE.PlaneGeometry(CANVAS_WIDTH, CANVAS_HEIGHT);
            const mat = new THREE.MeshBasicMaterial({ map: floorPlanRef.current.texture, transparent: true, opacity: floorPlanRef.current.opacity });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, 0, -2);
            threeRef.current.floorPlanGroup.add(mesh);
        }

    }, [radios, device, walls, drawWallMode, calculateRSSI, estimateDistanceFromRSSI, minRSSI, performTrilateration]);

    useEffect(() => {
        let animationFrameId: number;
        const animate = () => {
            updateScene();
            threeRef.current.renderer?.render(threeRef.current.scene, threeRef.current.camera);
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(animationFrameId);
    }, [updateScene]);

    // --- INTERACTION HANDLERS ---
    const handleDevicePosChange = useCallback((axis: 'x' | 'y', value: string) => {
        const meters = parseFloat(value);
        if (isNaN(meters)) return;
        const pixels = meters * PIXELS_PER_METER;
        setDevice(d => {
            const newPos = { ...d, [axis]: pixels };
            newPos.x = clamp(newPos.x, d.radius, CANVAS_WIDTH - d.radius);
            newPos.y = clamp(newPos.y, d.radius, CANVAS_HEIGHT - d.radius);
            return newPos;
        });
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const mousePos = getMousePos(e);
        if (drawWallMode) {
            if (!tempWallStartRef.current) {
                tempWallStartRef.current = { start: mousePos, end: mousePos };
            }
            return;
        }

        const { camera, interactiveObjects } = threeRef.current;
        if (!camera || !interactiveObjects) return;

        const threeMouse = new THREE.Vector2(
            (mousePos.x / CANVAS_WIDTH) * 2 - 1,
            -(mousePos.y / CANVAS_HEIGHT) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(threeMouse, camera);
        const intersects = raycaster.intersectObjects(interactiveObjects);
        if (intersects.length > 0) {
            const obj = intersects[0].object;
            const target = obj.userData.target;
            draggingRef.current = {
                type: obj.userData.type,
                target,
                offset: { x: target.x - mousePos.x, y: target.y - mousePos.y }
            };
        }
    }, [drawWallMode]);
    
    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const mousePos = getMousePos(e);

        if (drawWallMode && tempWallStartRef.current) {
            tempWallStartRef.current = { ...tempWallStartRef.current, end: mousePos };
            return;
        }

        if (draggingRef.current) {
            const { type, target, offset } = draggingRef.current;
            const newPos = { x: mousePos.x + offset.x, y: mousePos.y + offset.y };
            
            if (type === 'device') {
                setDevice(d => ({...d, ...newPos}));
            } else if (type === 'radio') {
                setRadios(rs => rs.map(r => r.id === (target as Radio).id ? { ...r, ...newPos } : r));
            }
        }
    }, [drawWallMode]);
    
    const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (drawWallMode && tempWallStartRef.current) {
            const end = getMousePos(e);
            const start = tempWallStartRef.current.start;
            if (distance(start, end) > 10) {
                const material: WallMaterial = 'drywall';
                const props = WALL_MATERIALS[material];
                const newWall: Wall = { id: generateId(), start, end, material, attenuation: props.attenuation, color: props.color };
                setWalls(w => [...w, newWall]);
            }
            tempWallStartRef.current = null;
            setDrawWallMode(false);
        }
        draggingRef.current = null;
    }, [drawWallMode]);
    
    // --- FILE & OPENCV HANDLERS ---
    const handleFloorPlanUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const texture = new THREE.Texture(img);
                texture.needsUpdate = true;
                floorPlanRef.current = { ...floorPlanRef.current, image: img, texture };
                setShowFloorPlan(true);
            };
            img.src = e.target.result as string;
        };
        reader.readAsDataURL(file);
    };

    const detectWalls = useCallback(() => {
        if (!opencvReady || !floorPlanRef.current.image) return;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = CANVAS_WIDTH;
        tempCanvas.height = CANVAS_HEIGHT;
        const ctx = tempCanvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(floorPlanRef.current.image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        const src = cv.imread(tempCanvas);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        const edges = new cv.Mat();
        cv.Canny(gray, edges, 50, 150, 3, false);
        const lines = new cv.Mat();
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 50, 10);

        const newWalls: Wall[] = [];
        const material = wallDetectionMaterial;
        const props = WALL_MATERIALS[material];
        for (let i = 0; i < lines.rows; ++i) {
            const start = { x: lines.data32S[i * 4], y: lines.data32S[i * 4 + 1] };
            const end = { x: lines.data32S[i * 4 + 2], y: lines.data32S[i * 4 + 3] };
            newWalls.push({ id: generateId(), start, end, material, attenuation: props.attenuation, color: props.color });
        }
        setWalls(newWalls);

        src.delete(); gray.delete(); edges.delete(); lines.delete();
    }, [opencvReady, wallDetectionMaterial]);
    
    useEffect(() => {
        floorPlanRef.current.opacity = floorPlanOpacity;
    }, [floorPlanOpacity]);
    
    useEffect(() => {
        floorPlanRef.current.show = showFloorPlan;
    }, [showFloorPlan]);


    return (
      <div className="min-h-screen flex flex-col">
          <header className="bg-gray-800 p-4 text-center shadow-lg">
              <h1 className="text-2xl font-bold text-cyan-400">Bluetooth Trilateration Simulator</h1>
          </header>
          <div className="flex-grow p-4 flex flex-col md:flex-row gap-4 max-w-screen-2xl mx-auto w-full">
              <Sidebar position="left">
                <SidebarSection title="Simulation Setup">
                    <ControlGroup label={`Number of Radios: ${numRadios}`}>
                        <Slider id="numRadios" value={numRadios} min={3} max={6} step={1} onChange={setNumRadios} />
                    </ControlGroup>
                </SidebarSection>
                <SidebarSection title="RSSI Model">
                     <ControlGroup label="Tx Power @ 1m">
                        <Slider id="txPower" value={txPower} min={-80} max={-30} step={1} onChange={setTxPower} unit=" dBm" />
                    </ControlGroup>
                     <ControlGroup label="Path Loss Exponent (n)">
                        <Slider id="pathLossExponent" value={pathLossExponent} min={2.0} max={4.0} step={0.1} onChange={setPathLossExponent} />
                    </ControlGroup>
                    <ControlGroup label="Min Detection RSSI">
                        <Slider id="minRSSI" value={minRSSI} min={-120} max={-60} step={1} onChange={setMinRSSI} unit=" dBm" />
                    </ControlGroup>
                </SidebarSection>
                <SidebarSection title="Environmental Effects">
                    <div className="flex items-center justify-between">
                        <label htmlFor="enableNoise" className="text-sm font-medium text-gray-300">Enable Noise</label>
                        <button onClick={() => setEnableNoise(!enableNoise)} className={`px-4 py-1 rounded ${enableNoise ? 'bg-cyan-500' : 'bg-gray-600'}`}>{enableNoise ? 'On' : 'Off'}</button>
                    </div>
                    {enableNoise && (
                        <ControlGroup label="Noise Standard Deviation">
                            <Slider id="noiseStdDev" value={noiseStdDev} min={0} max={10} step={0.5} onChange={setNoiseStdDev} unit=" dB" />
                        </ControlGroup>
                    )}
                     <div className="flex items-center justify-between">
                        <label htmlFor="enableWalls" className="text-sm font-medium text-gray-300">Enable Walls</label>
                        <button onClick={() => setEnableWalls(!enableWalls)} className={`px-4 py-1 rounded ${enableWalls ? 'bg-cyan-500' : 'bg-gray-600'}`}>{enableWalls ? 'On' : 'Off'}</button>
                    </div>
                    {enableWalls && <>
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">Angle Effect</label>
                            <button onClick={() => setEnableAngleEffect(!enableAngleEffect)} className={`px-4 py-1 rounded ${enableAngleEffect ? 'bg-cyan-500' : 'bg-gray-600'}`}>{enableAngleEffect ? 'On' : 'Off'}</button>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-300">Cumulative Effect</label>
                            <button onClick={() => setEnableCumulativeEffect(!enableCumulativeEffect)} className={`px-4 py-1 rounded ${enableCumulativeEffect ? 'bg-cyan-500' : 'bg-gray-600'}`}>{enableCumulativeEffect ? 'On' : 'Off'}</button>
                        </div>
                    </>}
                </SidebarSection>
                <SidebarSection title="Wall Editor">
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setDrawWallMode(true)} disabled={drawWallMode} className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded">
                            Draw Wall
                        </button>
                         <button onClick={() => setWalls([])} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded">
                            Clear Walls
                        </button>
                         <button onClick={resetWalls} className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded col-span-2">
                            Reset to Demo
                        </button>
                    </div>
                </SidebarSection>
                <SidebarSection title="Floor Plan">
                     <ControlGroup label="Upload Image">
                        <input type="file" accept="image/*" onChange={handleFloorPlanUpload} className="text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100"/>
                    </ControlGroup>
                     <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-300">Show Floor Plan</label>
                        <button onClick={() => setShowFloorPlan(!showFloorPlan)} className={`px-4 py-1 rounded ${showFloorPlan ? 'bg-cyan-500' : 'bg-gray-600'}`}>{showFloorPlan ? 'On' : 'Off'}</button>
                    </div>
                     <ControlGroup label="Opacity">
                        <Slider id="floorPlanOpacity" value={floorPlanOpacity} min={0.1} max={1.0} step={0.1} onChange={setFloorPlanOpacity} />
                    </ControlGroup>
                     <ControlGroup label="Wall Material for Detection">
                        <select value={wallDetectionMaterial} onChange={(e) => setWallDetectionMaterial(e.target.value as WallMaterial)} className="bg-gray-600 border border-gray-500 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5">
                            {Object.entries(WALL_MATERIALS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
                        </select>
                    </ControlGroup>
                    <button onClick={detectWalls} disabled={!opencvReady || !floorPlanRef.current.image} className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded">
                        Detect Walls from Image
                    </button>
                </SidebarSection>
              </Sidebar>

              <main className="flex-grow flex items-center justify-center">
                  <canvas 
                    ref={canvasRef} 
                    width={CANVAS_WIDTH} 
                    height={CANVAS_HEIGHT} 
                    className="max-w-full max-h-full rounded-lg shadow-2xl bg-gray-800"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  />
              </main>

              <Sidebar position="right">
                <SidebarSection title="Live Data">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-cyan-400 uppercase bg-gray-700/50">
                                <tr>
                                    <th scope="col" className="px-4 py-2">Radio</th>
                                    <th scope="col" className="px-4 py-2">RSSI</th>
                                    <th scope="col" className="px-4 py-2">True Dist.</th>
                                    <th scope="col" className="px-4 py-2">Est. Dist.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {measurements.map(m => {
                                    const rssiColor = m.rssi > -70 ? 'text-green-400' : m.rssi > -90 ? 'text-yellow-400' : 'text-red-400';
                                    return (
                                        <tr key={m.radio.id} className="border-b border-gray-700">
                                            <td className="px-4 py-2 font-medium">{m.radio.label}</td>
                                            <td className={`px-4 py-2 font-mono ${rssiColor}`}>{m.rssi.toFixed(1)}</td>
                                            <td className="px-4 py-2 font-mono">{m.trueDistance.toFixed(2)}m</td>
                                            <td className="px-4 py-2 font-mono">{m.estimatedDistance.toFixed(2)}m</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </SidebarSection>
                 <SidebarSection title="Device Position">
                    <ControlGroup label={`Device X: ${(device.x / PIXELS_PER_METER).toFixed(2)}m`}>
                        <input
                            type="range"
                            min="0"
                            max={CANVAS_WIDTH / PIXELS_PER_METER}
                            step="0.1"
                            value={device.x / PIXELS_PER_METER}
                            onChange={e => handleDevicePosChange('x', e.target.value)}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-sky-500"
                        />
                    </ControlGroup>
                    <ControlGroup label={`Device Y: ${(device.y / PIXELS_PER_METER).toFixed(2)}m`}>
                        <input
                            type="range"
                            min="0"
                            max={CANVAS_HEIGHT / PIXELS_PER_METER}
                            step="0.1"
                            value={device.y / PIXELS_PER_METER}
                            onChange={e => handleDevicePosChange('y', e.target.value)}
                            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-sky-500"
                        />
                    </ControlGroup>
                    <div className="font-mono text-sm space-y-2 border-t border-gray-700 pt-3 mt-3">
                        <p>Est: {estimatedPosition ? <span className="text-rose-400">X: {(estimatedPosition.x / PIXELS_PER_METER).toFixed(2)}m, Y: {(estimatedPosition.y / PIXELS_PER_METER).toFixed(2)}m</span> : <span className="text-gray-400">Not available</span>}</p>
                        <p>Error: {estimatedPosition ? <span className="text-red-400">{(distance(device, estimatedPosition) / PIXELS_PER_METER).toFixed(2)}m</span> : <span className="text-gray-400">N/A</span>}</p>
                    </div>
                 </SidebarSection>
              </Sidebar>
          </div>
      </div>
    );
};

export default App;
