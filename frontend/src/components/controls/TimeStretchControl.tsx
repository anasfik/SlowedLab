/**
 * Individual Effect Control Components
 */

import React from 'react';
import { TimeStretchSettings, ReverbSettings, EqualizerSettings, CompressorSettings } from '../../audio-engine/src/types';
import '../../styles/ControlSliders.css';

// ============= TIME STRETCH CONTROL =============

interface TimeStretchControlProps {
  settings: TimeStretchSettings;
  onChange: (settings: TimeStretchSettings) => void;
  disabled?: boolean;
}

export function TimeStretchControl({
  settings,
  onChange,
  disabled,
}: TimeStretchControlProps) {
  return (
    <div className="control-section">
      <div className="control-group">
        <label>Speed (0.5x - 2.0x)</label>
        <div className="slider-with-value">
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={settings.rate}
            onChange={(e) =>
              onChange({
                ...settings,
                rate: parseFloat(e.target.value),
              })
            }
            disabled={disabled}
          />
          <span className="value-display">{settings.rate.toFixed(2)}x</span>
        </div>
      </div>

      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={settings.preservePitch}
            onChange={(e) =>
              onChange({
                ...settings,
                preservePitch: e.target.checked,
              })
            }
            disabled={disabled}
          />
          Preserve Pitch
        </label>
        <p className="help-text">
          {settings.preservePitch
            ? 'Pitch will remain unchanged'
            : 'Pitch will change with tempo'}
        </p>
      </div>

      <div className="control-group">
        <label>Quality</label>
        <select
          value={settings.qualityMode}
          onChange={(e) =>
            onChange({
              ...settings,
              qualityMode: e.target.value as any,
            })
          }
          disabled={disabled}
        >
          <option value="draft">Draft (Fast)</option>
          <option value="normal">Normal</option>
          <option value="high">High (Slow)</option>
        </select>
      </div>
    </div>
  );
}

// ============= REVERB CONTROL =============

interface ReverbControlProps {
  settings: ReverbSettings;
  onChange: (settings: ReverbSettings) => void;
  disabled?: boolean;
}

export function ReverbControl({
  settings,
  onChange,
  disabled,
}: ReverbControlProps) {
  return (
    <div className="control-section">
      <div className="control-group">
        <label>Room Size (0 - 1)</label>
        <div className="slider-with-value">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.roomSize}
            onChange={(e) =>
              onChange({
                ...settings,
                roomSize: parseFloat(e.target.value),
              })
            }
            disabled={disabled}
          />
          <span className="value-display">{(settings.roomSize * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>Damping (0 - 1)</label>
        <div className="slider-with-value">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.damping}
            onChange={(e) =>
              onChange({
                ...settings,
                damping: parseFloat(e.target.value),
              })
            }
            disabled={disabled}
          />
          <span className="value-display">{(settings.damping * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>Wet Level (0 - 1)</label>
        <div className="slider-with-value">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.wetLevel}
            onChange={(e) =>
              onChange({
                ...settings,
                wetLevel: parseFloat(e.target.value),
              })
            }
            disabled={disabled}
          />
          <span className="value-display">{(settings.wetLevel * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="control-group">
        <label>Pre-Delay (ms)</label>
        <div className="slider-with-value">
          <input
            type="range"
            min="0"
            max="200"
            step="1"
            value={settings.preDelay}
            onChange={(e) =>
              onChange({
                ...settings,
                preDelay: parseInt(e.target.value),
              })
            }
            disabled={disabled}
          />
          <span className="value-display">{settings.preDelay} ms</span>
        </div>
      </div>

      <div className="control-group">
        <label>Stereo Width (0 - 1)</label>
        <div className="slider-with-value">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.width}
            onChange={(e) =>
              onChange({
                ...settings,
                width: parseFloat(e.target.value),
              })
            }
            disabled={disabled}
          />
          <span className="value-display">{(settings.width * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

// ============= EQUALIZER CONTROL =============

interface EqualizerControlProps {
  settings: EqualizerSettings;
  onChange: (settings: EqualizerSettings) => void;
  disabled?: boolean;
}

export function EqualizerControl({
  settings,
  onChange,
  disabled,
}: EqualizerControlProps) {
  return (
    <div className="control-section">
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              onChange({
                ...settings,
                enabled: e.target.checked,
              })
            }
            disabled={disabled}
          />
          Enable Equalizer
        </label>
      </div>

      {settings.enabled && (
        <div className="eq-bands">
          {settings.bands.map((band, index) => (
            <div key={band.id} className="eq-band">
              <div className="band-header">
                <span className="band-name">{band.frequency} Hz</span>
              </div>
              <div className="band-controls">
                <label>Gain (dB)</label>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.1"
                  value={band.gain}
                  onChange={(e) => {
                    const newBands = [...settings.bands];
                    newBands[index].gain = parseFloat(e.target.value);
                    onChange({
                      ...settings,
                      bands: newBands,
                    });
                  }}
                  disabled={disabled}
                />
                <span className="value">{band.gain.toFixed(1)} dB</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============= COMPRESSOR CONTROL =============

interface CompressorControlProps {
  settings: CompressorSettings;
  onChange: (settings: CompressorSettings) => void;
  disabled?: boolean;
}

export function CompressorControl({
  settings,
  onChange,
  disabled,
}: CompressorControlProps) {
  return (
    <div className="control-section">
      <div className="control-group">
        <label>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) =>
              onChange({
                ...settings,
                enabled: e.target.checked,
              })
            }
            disabled={disabled}
          />
          Enable Compressor
        </label>
      </div>

      {settings.enabled && (
        <>
          <div className="control-group">
            <label>Threshold (dB)</label>
            <div className="slider-with-value">
              <input
                type="range"
                min="-100"
                max="0"
                step="1"
                value={settings.threshold}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    threshold: parseInt(e.target.value),
                  })
                }
                disabled={disabled}
              />
              <span className="value-display">{settings.threshold} dB</span>
            </div>
          </div>

          <div className="control-group">
            <label>Ratio (1:{settings.ratio.toFixed(1)})</label>
            <input
              type="range"
              min="1"
              max="16"
              step="0.1"
              value={settings.ratio}
              onChange={(e) =>
                onChange({
                  ...settings,
                  ratio: parseFloat(e.target.value),
                })
              }
              disabled={disabled}
            />
          </div>

          <div className="control-group">
            <label>Attack (ms)</label>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={settings.attack}
              onChange={(e) =>
                onChange({
                  ...settings,
                  attack: parseInt(e.target.value),
                })
              }
              disabled={disabled}
            />
            <span className="value-display">{settings.attack} ms</span>
          </div>

          <div className="control-group">
            <label>Release (ms)</label>
            <input
              type="range"
              min="0"
              max="5000"
              step="10"
              value={settings.release}
              onChange={(e) =>
                onChange({
                  ...settings,
                  release: parseInt(e.target.value),
                })
              }
              disabled={disabled}
            />
            <span className="value-display">{settings.release} ms</span>
          </div>

          <div className="control-group">
            <label>Makeup Gain (dB)</label>
            <input
              type="range"
              min="0"
              max="40"
              step="0.1"
              value={settings.makeup}
              onChange={(e) =>
                onChange({
                  ...settings,
                  makeup: parseFloat(e.target.value),
                })
              }
              disabled={disabled}
            />
            <span className="value-display">{settings.makeup.toFixed(1)} dB</span>
          </div>
        </>
      )}
    </div>
  );
}

export default TimeStretchControl;
