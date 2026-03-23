/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Mountain, Package, Shield, Tent, Pickaxe, Coins } from 'lucide-react';

// --- Types ---
type CardStatus = 'available' | 'locked';

interface CardData {
  id: string;
  title: string;
  description: string;
  cost?: number;
  costType?: 'wood' | 'stone' | 'iron' | 'gold';
  buildTime?: string;
  built?: string;
  status: CardStatus;
  unlockMessage?: string;
  icon: React.ReactNode;
}

// --- Data ---
const cardsData: CardData[] = [
  {
    id: 'quarry',
    title: 'Quarry',
    description: 'Produces stone',
    cost: 200,
    costType: 'wood',
    buildTime: '3s',
    built: '0/1',
    status: 'available',
    icon: <Mountain size={64} strokeWidth={1.5} />,
  },
  {
    id: 'wood_storage',
    title: 'Wood Storage',
    description: 'Increases storage capacity',
    cost: 320,
    costType: 'wood',
    buildTime: '3s',
    built: '0/1',
    status: 'available',
    icon: <Package size={64} strokeWidth={1.5} />,
  },
  {
    id: 'vault',
    title: 'Vault',
    description: 'Keeps your resources safe',
    cost: 300,
    costType: 'wood',
    buildTime: '3s',
    built: '0/1',
    status: 'available',
    icon: <Shield size={64} strokeWidth={1.5} />,
  },
  {
    id: 'residence',
    title: 'Residence',
    description: 'Produces gold',
    status: 'locked',
    unlockMessage: 'Upgrade Headquarters to level 3 to build more!',
    icon: <Tent size={64} strokeWidth={1.5} />,
  },
  {
    id: 'iron_mine',
    title: 'Iron Mine',
    description: 'Produces iron',
    status: 'locked',
    unlockMessage: 'Upgrade Headquarters to level 3 to unlock!',
    icon: <Pickaxe size={64} strokeWidth={1.5} />,
  },
  {
    id: 'gold_storage',
    title: 'Gold Storage',
    description: 'Increases storage capacity',
    status: 'locked',
    unlockMessage: 'Upgrade Headquarters to level 3 to unlock!',
    icon: <Coins size={64} strokeWidth={1.5} />,
  },
];

const tabs = [
  { id: 'economy', label: 'Economy', badge: 3 },
  { id: 'defense', label: 'Defense' },
  { id: 'support', label: 'Support', badge: 1 },
  { id: 'decoration', label: 'Decoration' },
];

// --- Components ---

const WoodIcon = () => (
  <div className="relative w-7 h-5 flex items-center justify-center drop-shadow-sm">
    <div className="absolute w-6 h-1.5 bg-[#a05a2c] rounded-sm transform rotate-[-15deg] translate-y-[-4px] border border-[#5c3012]"></div>
    <div className="absolute w-6 h-1.5 bg-[#b86b35] rounded-sm transform rotate-[10deg] translate-y-[2px] border border-[#5c3012]"></div>
    <div className="absolute w-6 h-1.5 bg-[#c97a3f] rounded-sm border border-[#5c3012] z-10"></div>
  </div>
);

const IconWrapper = ({ children, locked }: { children: React.ReactNode, locked?: boolean }) => (
  <div className={`relative w-full h-full flex items-center justify-center ${locked ? 'opacity-50 grayscale' : ''}`}>
    {/* Subtle highlight behind icon */}
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.6)_0%,transparent_60%)]"></div>
    <div className="relative z-10 text-slate-700 drop-shadow-[0_4px_4px_rgba(0,0,0,0.3)]">
      {children}
    </div>
  </div>
);

const Card = ({ data }: { data: CardData }) => {
  const isAvailable = data.status === 'available';

  return (
    <div
      className={`
        relative flex flex-col w-[160px] h-[230px] shrink-0 rounded-lg border-[3px] overflow-hidden
        ${isAvailable ? 'border-[#4a90e2] bg-[#fdf8e7]' : 'border-[#a39e93] bg-[#e6e1d6]'}
        shadow-[0_4px_6px_rgba(0,0,0,0.3)]
        transition-transform hover:scale-[1.02] cursor-pointer
      `}
    >
      {/* Top Image Area */}
      <div className="h-[100px] flex items-center justify-center relative mt-2">
        <IconWrapper locked={!isAvailable}>
          {data.icon}
        </IconWrapper>
      </div>

      {/* Content Area */}
      <div className="flex flex-col flex-1 px-2 pb-1 text-center">
        <h3
          className="text-[18px] font-black tracking-wide mb-0.5 leading-tight"
          style={{
            color: '#333',
            WebkitTextStroke: '1px white',
            textShadow: '0px 2px 2px rgba(0,0,0,0.3)',
            fontFamily: '"Arial Black", Impact, sans-serif'
          }}
        >
          {data.title}
        </h3>
        <p className="text-[12px] font-bold text-gray-800 leading-tight mb-2 px-1">
          {data.description}
        </p>

        <div className="mt-auto">
          {isAvailable ? (
            <>
              <div className="flex items-center justify-center gap-1.5 mb-2 mt-2">
                {data.costType === 'wood' && <WoodIcon />}
                <span className="text-[22px] font-black text-gray-800" style={{ textShadow: '0 1px 1px rgba(255,255,255,0.8)' }}>
                  {data.cost}
                </span>
              </div>
              <div className="flex justify-between items-end text-[9px] font-bold text-gray-600 uppercase tracking-tighter px-1 pb-1">
                <div className="text-left leading-none">
                  <div className="mb-0.5">Build time:</div>
                  <div className="text-gray-900 text-[10px]">{data.buildTime}</div>
                </div>
                <div className="text-right leading-none">
                  <div className="mb-0.5">Built:</div>
                  <div className="text-gray-900 text-[10px]">{data.built}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-[#8b8276] text-white text-[11px] font-bold p-2 border-t-[3px] border-[#7a7266] shadow-[inset_0_3px_5px_rgba(0,0,0,0.15)] leading-snug h-[76px] flex items-center justify-center text-center">
              {data.unlockMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('economy');

  return (
    <div className="min-h-screen bg-[#1a2b3c] flex flex-col justify-end overflow-hidden font-sans select-none relative">
      {/* Simulated Game Background */}
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1574169208507-84376144848b?q=80&w=2079&auto=format&fit=crop')] bg-cover bg-center opacity-30 mix-blend-luminosity"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#1a2b3c] to-transparent opacity-80"></div>
      
      {/* Main UI Container */}
      <div className="relative z-10 w-full max-w-5xl mx-auto pb-6">
        
        {/* Cards Scroll Area */}
        <div className="bg-[#e8dfc8] border-t-[6px] border-[#d4c8b0] pt-6 pb-2 px-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] relative z-10">
          {/* Light blue accent line at the bottom of the cards area */}
          <div className="absolute bottom-0 left-0 right-0 h-3 bg-[#aed4e6] z-0 border-t border-[#9bc1d3]"></div>
          
          <div className="flex gap-2.5 overflow-x-auto pb-4 px-2 snap-x hide-scrollbar relative z-10">
            {cardsData.map((card) => (
              <div key={card.id} className="snap-start">
                <Card data={card} />
              </div>
            ))}
          </div>
        </div>

        {/* Tabs Area */}
        <div className="flex justify-center -mt-1 relative z-20 px-4">
          <div className="flex gap-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative px-6 py-2 font-black text-[15px] tracking-wide transition-all min-w-[120px] flex justify-center items-center
                    ${isActive 
                      ? 'bg-[#fdf8e7] text-gray-800 z-10 pt-3 pb-2 -mt-1 shadow-[0_4px_4px_rgba(0,0,0,0.2)] rounded-b-xl border-b-4 border-x-2 border-[#d4c8b0]' 
                      : 'bg-[#3a8ebf] text-white hover:bg-[#459bd0] pt-2 pb-1.5 rounded-b-xl border-b-4 border-x-2 border-[#296a91] shadow-[inset_0_-2px_4px_rgba(0,0,0,0.2)]'
                    }
                  `}
                  style={{
                    textShadow: isActive ? 'none' : '0px 1px 2px rgba(0,0,0,0.6)',
                    WebkitTextStroke: isActive ? '0.5px white' : '0.5px #1e5273',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{tab.label}</span>
                    {tab.badge && (
                      <span className="bg-[#e33b2e] text-white text-[11px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center border border-[#8a1c14] shadow-sm"
                            style={{ WebkitTextStroke: '0', textShadow: 'none' }}>
                        {tab.badge}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* Global styles for hiding scrollbar but keeping functionality */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
