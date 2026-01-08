/**
 * EffectControls Component
 * Comprehensive effect sliders and controls
 */

import React, { useState } from 'react';
import { EffectsConfig } from '../audio-engine/src/types';
import TimeStretchControl from './controls/TimeStretchControl';
import ReverbControl from './controls/ReverbControl';
import EqualizerControl from './controls/EqualizerControl';
import CompressorControl from './controls/CompressorControl';
import '../styles/EffectControls.css';

interface EffectControlsProps {
  config: EffectsConfig;
  onChange: (config: EffectsConfig) => void;
  disabled?: boolean;
}

export default function EffectControls({
  config,
  onChange,
  disabled,
}: EffectControlsProps) {
  const [activeTab, setActiveTab] = useState<
    'time-stretch' | 'reverb' | 'eq' | 'compressor'
  >('time-stretch');

  return (
    <div className="effect-controls-container">
      <div className="effect-tabs">
        <button
          className={`tab tab-primary ${activeTab === 'time-stretch' ? 'active' : ''}`}
          onClick={() => setActiveTab('time-stretch')}
          disabled={disabled}
        >
          ⚡ Time Stretch
        </button>
        <button
          className={`tab tab-primary ${activeTab === 'reverb' ? 'active' : ''}`}
          onClick={() => setActiveTab('reverb')}
          disabled={disabled}
        >
          ✨ Reverb
        </button>
        <button
          className={`tab ${activeTab === 'eq' ? 'active' : ''}`}
          onClick={() => setActiveTab('eq')}
          disabled={disabled}
        >
          EQ
        </button>
        <button
          className={`tab ${activeTab === 'compressor' ? 'active' : ''}`}
          onClick={() => setActiveTab('compressor')}
          disabled={disabled}
        >
          Compressor
        </button>
      </div>

      <div className="effect-panel">
        {activeTab === 'time-stretch' && (
          <TimeStretchControl
            settings={config.timeStretch}
            onChange={(settings) =>
              onChange({ ...config, timeStretch: settings })
            }
            disabled={disabled}
          />
        )}

        {activeTab === 'reverb' && (
          <ReverbControl
            settings={config.reverb}
            onChange={(settings) =>
              onChange({ ...config, reverb: settings })
            }
            disabled={disabled}
          />
        )}

        {activeTab === 'eq' && (
          <EqualizerControl
            settings={config.equalizer}
            onChange={(settings) =>
              onChange({ ...config, equalizer: settings })
            }
            disabled={disabled}
          />
        )}

        {activeTab === 'compressor' && (
          <CompressorControl
            settings={config.compressor}
            onChange={(settings) =>
              onChange({ ...config, compressor: settings })
            }
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
