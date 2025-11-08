
import React from 'react';

interface SidebarProps {
  position: 'left' | 'right';
  children: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({ position, children }) => {
  const positionClass = position === 'left' ? 'sidebar-left' : 'sidebar-right';
  return (
    <aside className={`w-full md:w-80 lg:w-96 bg-gray-800 bg-opacity-80 backdrop-blur-sm p-4 rounded-lg shadow-2xl ${positionClass}`}>
      <div className="flex flex-col space-y-4">
        {children}
      </div>
    </aside>
  );
};

export const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-gray-700/50 p-3 rounded-md">
    <h3 className="text-lg font-bold text-cyan-400 mb-3 border-b border-gray-600 pb-2">{title}</h3>
    <div className="flex flex-col space-y-3">
      {children}
    </div>
  </div>
);

export const ControlGroup: React.FC<{ label: string; children: React.ReactNode; helpText?: string }> = ({ label, children, helpText }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        {children}
        {helpText && <small className="text-gray-400 mt-1 block">{helpText}</small>}
    </div>
);


export default Sidebar;
