import { FiRotateCcw, FiEdit2, FiShare2, FiX, FiClock, FiWind, FiVolume2, FiZap, FiLayers, FiCpu } from 'react-icons/fi';
import { EffectSettings, UserPreset } from '../App';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    currentTrackName: string;
    isPlaying: boolean;
    activePresetLabel: string;
    effects: EffectSettings;
    setEffects: React.Dispatch<React.SetStateAction<EffectSettings>>;
    setSelectedPreset: (name: string) => void;
    abActive: boolean;
    toggleAB: () => void;
    userPresets: UserPreset[];
    applyPreset: (name: string) => void;
    renameUserPreset: (id: string, name: string) => void;
    shareUserPreset: (preset: UserPreset) => void;
    deleteUserPreset: (id: string) => void;
    resetSession: () => void;
    resetPresets: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    currentTrackName,
    isPlaying,
    activePresetLabel,
    effects,
    setEffects,
    setSelectedPreset,
    abActive,
    toggleAB,
    userPresets,
    applyPreset,
    renameUserPreset,
    shareUserPreset,
    deleteUserPreset,
    resetSession,
    resetPresets,
}) => {
    return (
        <>
            <div className={`drawer-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
            <aside className={`sidebar-drawer glass-panel ${isOpen ? 'open' : ''}`}>
                <button className="drawer-close-btn" onClick={onClose} title="Close Settings">×</button>

                <div className="sidebar-brand">
                    <div className="brand-mark">
                        <div className="mark-inner">SL</div>
                    </div>
                    <div className="brand-text">
                        <h2 className="brand-title">SlowedLab</h2>
                        <span className="brand-subtitle">Control Center</span>
                    </div>
                </div>

                <div className="sidebar-content custom-scrollbar">
                    <section className="sidebar-block">
                        <header className="sidebar-label">Session Metadata</header>
                        <div className="session-info glass-panel">
                            <div className="session-line">
                                <span className="label-tag">Track</span>
                                <span className="session-value truncate">{currentTrackName}</span>
                            </div>
                            <div className="session-line">
                                <span className="label-tag">Status</span>
                                <span className={`status-pill ${isPlaying ? 'live' : ''}`}>
                                    {isPlaying ? 'Live' : 'Idle'}
                                </span>
                            </div>
                            <div className="session-line">
                                <span className="label-tag">Preset</span>
                                <span className="session-value">{activePresetLabel}</span>
                            </div>
                            <button className="action-link" onClick={resetSession}>
                                <FiRotateCcw style={{ marginRight: '4px' }} /> Reset All
                            </button>
                        </div>
                    </section>

                    <section className="sidebar-block effects-panel">
                        <header className="effects-header">
                            <h3>Audio FX</h3>
                            <button className="action-link" onClick={resetPresets}>
                                Reset FX
                            </button>
                        </header>

                        <div className="sliders-grid">
                            <div className="effect-item">
                                <header>
                                    <span className="fx-icon"><FiClock /></span>
                                    <span className="fx-name">Playback Speed</span>
                                    <span className="fx-value">{effects.playbackRate.toFixed(2)}x</span>
                                </header>
                                <input
                                    type="range"
                                    min="0.5"
                                    max="1.5"
                                    step="0.01"
                                    value={effects.playbackRate}
                                    onChange={(e) => {
                                        setEffects((prev) => ({
                                            ...prev,
                                            playbackRate: parseFloat(e.target.value),
                                        }));
                                        setSelectedPreset('Custom');
                                    }}
                                />
                            </div>

                            <div className="effect-item">
                                <header>
                                    <span className="fx-icon"><FiWind /></span>
                                    <span className="fx-name">Reverb Depth</span>
                                    <span className="fx-value">{effects.reverbAmount}%</span>
                                </header>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={effects.reverbAmount}
                                    onChange={(e) => {
                                        setEffects((prev) => ({
                                            ...prev,
                                            reverbAmount: parseInt(e.target.value),
                                        }));
                                        setSelectedPreset('Custom');
                                    }}
                                />
                            </div>

                            <div className="effect-item">
                                <header>
                                    <span className="fx-icon"><FiVolume2 /></span>
                                    <span className="fx-name">Bass Impact</span>
                                    <span className="fx-value">{effects.bassBoost} dB</span>
                                </header>
                                <input
                                    type="range"
                                    min="-40"
                                    max="40"
                                    step="1"
                                    value={effects.bassBoost}
                                    onChange={(e) => {
                                        setEffects((prev) => ({
                                            ...prev,
                                            bassBoost: parseInt(e.target.value),
                                        }));
                                        setSelectedPreset('Custom');
                                    }}
                                />
                            </div>

                            <div className="effect-item">
                                <header>
                                    <span className="fx-icon"><FiZap /></span>
                                    <span className="fx-name">Treble Clarity</span>
                                    <span className="fx-value">{effects.trebleBoost} dB</span>
                                </header>
                                <input
                                    type="range"
                                    min="-40"
                                    max="40"
                                    step="1"
                                    value={effects.trebleBoost}
                                    onChange={(e) => {
                                        setEffects((prev) => ({
                                            ...prev,
                                            trebleBoost: parseInt(e.target.value),
                                        }));
                                        setSelectedPreset('Custom');
                                    }}
                                />
                            </div>

                            <div className="effect-item">
                                <header>
                                    <span className="fx-icon"><FiLayers /></span>
                                    <span className="fx-name">Dynamics</span>
                                    <span className="fx-value">{effects.compression}%</span>
                                </header>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={effects.compression}
                                    onChange={(e) => {
                                        setEffects((prev) => ({
                                            ...prev,
                                            compression: parseInt(e.target.value),
                                        }));
                                        setSelectedPreset('Custom');
                                    }}
                                />
                            </div>

                            <div className="effect-item">
                                <header>
                                    <span className="fx-icon"><FiCpu /></span>
                                    <span className="fx-name">Saturation</span>
                                    <span className="fx-value">{effects.distortion}%</span>
                                </header>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={effects.distortion}
                                    onChange={(e) => {
                                        setEffects((prev) => ({
                                            ...prev,
                                            distortion: parseInt(e.target.value),
                                        }));
                                        setSelectedPreset('Custom');
                                    }}
                                />
                            </div>
                        </div>

                        <div className="sidebar-footer-tools">
                            <button
                                className={`ab-toggle ${abActive ? 'active' : ''}`}
                                onClick={toggleAB}
                            >
                                <span className="toggle-indicator"></span>
                                A/B Comparison {abActive ? 'ON' : 'OFF'}
                            </button>

                            {userPresets.length > 0 && (
                                <div className="user-presets-section">
                                    <h4 className="section-subtitle">My Library</h4>
                                    <div className="user-preset-grid">
                                        {userPresets.map((preset) => (
                                            <div className="preset-card glass-panel" key={preset.id}>
                                                <button
                                                    className="preset-apply-btn"
                                                    onClick={() => applyPreset(preset.name)}
                                                    title={`Apply ${preset.name}`}
                                                >
                                                    <span className="preset-name">{preset.name}</span>
                                                </button>
                                                <div className="preset-actions">
                                                    <button onClick={() => renameUserPreset(preset.id, prompt('Rename preset', preset.name) || preset.name)} title="Rename"><FiEdit2 /></button>
                                                    <button onClick={() => shareUserPreset(preset)} title="Share"><FiShare2 /></button>
                                                    <button onClick={() => deleteUserPreset(preset.id)} className="delete" title="Delete"><FiX /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
