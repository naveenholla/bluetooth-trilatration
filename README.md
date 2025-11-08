# Bluetooth Trilateration Simulator

An interactive web-based Bluetooth Low Energy (BLE) trilateration simulator that demonstrates realistic indoor positioning using RSSI measurements, rendered with Three.js and featuring automatic wall detection with OpenCV.js.

## Features

- Interactive 3D visualization of Bluetooth positioning
- RSSI-based distance estimation
- Trilateration algorithm for position calculation
- Wall detection using OpenCV
- Real-time simulation controls

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to `http://localhost:3000`

## Build for Production

```bash
npm run build
npm run preview
```
