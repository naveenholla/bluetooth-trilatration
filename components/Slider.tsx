
import React from 'react';

interface SliderProps {
  id: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
}

const Slider: React.FC<SliderProps> = ({ id, value, min, max, step, onChange, unit }) => {
  return (
    <div className="flex items-center space-x-2">
      <input
        type="range"
        id={id}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
      />
      <span className="text-sm text-cyan-300 font-mono w-24 text-right">
        {value.toFixed(id === 'pathLossExponent' ? 1 : 0)}{unit}
      </span>
    </div>
  );
};

export default Slider;
