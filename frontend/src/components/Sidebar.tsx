import { FiClock, FiCpu, FiEdit2, FiLayers, FiRotateCcw, FiShare2, FiTrash2, FiVolume2, FiWind, FiX, FiZap } from 'react-icons/fi';
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

const controls = [
    { key: 'playbackRate', label: 'Speed', hint: 'Changes speed and pitch', icon: FiClock, min: 0.5, max: 1.5, step: 0.01, format: (value: number) => `${value.toFixed(2)}×` },
    { key: 'reverbAmount', label: 'Space', hint: 'Adds room and atmosphere', icon: FiWind, min: 0, max: 100, step: 1, format: (value: number) => `${value}%` },
    { key: 'bassBoost', label: 'Bass', hint: 'Shapes lower frequencies', icon: FiVolume2, min: -40, max: 40, step: 1, format: (value: number) => `${value > 0 ? '+' : ''}${value}` },
    { key: 'trebleBoost', label: 'Treble', hint: 'Shapes higher frequencies', icon: FiZap, min: -40, max: 40, step: 1, format: (value: number) => `${value > 0 ? '+' : ''}${value}` },
    { key: 'compression', label: 'Control', hint: 'Evens out loud and quiet parts', icon: FiLayers, min: 0, max: 100, step: 1, format: (value: number) => `${value}%` },
    { key: 'distortion', label: 'Texture', hint: 'Adds warmth and grit', icon: FiCpu, min: 0, max: 100, step: 1, format: (value: number) => `${value}%` },
] as const;

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
    if (!isOpen) return null;

    return (
        <aside className="studio-drawer effects-drawer" role="dialog" aria-modal="true" aria-labelledby="effects-title">
            <header className="drawer-heading">
                <div>
                    <p className="overline">Sound controls</p>
                    <h2 id="effects-title">Shape your mix</h2>
                </div>
                <button className="icon-button" onClick={onClose} aria-label="Close sound controls"><FiX /></button>
            </header>

            <div className="drawer-scroll">
                <section className="session-summary" aria-label="Current session">
                    <span className={`session-dot ${isPlaying ? 'playing' : ''}`} aria-hidden="true" />
                    <div>
                        <strong>{currentTrackName}</strong>
                        <small>{activePresetLabel} · {isPlaying ? 'Playing' : 'Ready'}</small>
                    </div>
                </section>

                <section className="effect-controls">
                    <div className="section-heading-row">
                        <div><h3>Fine tune</h3><p>Changes apply while audio plays.</p></div>
                        <button className="text-button" onClick={resetPresets}><FiRotateCcw /> Reset</button>
                    </div>

                    {controls.map(({ key, label, hint, icon: Icon, min, max, step, format }) => {
                        const value = effects[key];
                        return (
                            <div className="effect-control" key={key}>
                                <label htmlFor={`effect-${key}`}>
                                    <span className="effect-icon"><Icon /></span>
                                    <span className="effect-copy"><strong>{label}</strong><small>{hint}</small></span>
                                    <output htmlFor={`effect-${key}`}>{format(value)}</output>
                                </label>
                                <input
                                    id={`effect-${key}`}
                                    type="range"
                                    min={min}
                                    max={max}
                                    step={step}
                                    value={value}
                                    onChange={(event) => {
                                        setEffects(previous => ({ ...previous, [key]: Number(event.target.value) }));
                                        setSelectedPreset('Custom');
                                    }}
                                />
                            </div>
                        );
                    })}
                </section>

                <button className={`compare-toggle ${abActive ? 'active' : ''}`} onClick={toggleAB} aria-pressed={abActive}>
                    <span className="compare-switch"><span /></span>
                    <span><strong>Compare with preset</strong><small>Switch between your edits and starting sound</small></span>
                </button>

                {userPresets.length > 0 && (
                    <section className="saved-presets">
                        <div className="section-heading-row"><div><h3>Saved presets</h3><p>Your reusable sounds.</p></div></div>
                        <div className="saved-preset-list">
                            {userPresets.map((preset) => (
                                <article className="saved-preset" key={preset.id}>
                                    <button className="saved-preset-name" onClick={() => applyPreset(preset.name)}>{preset.name}</button>
                                    <div>
                                        <button onClick={() => renameUserPreset(preset.id, prompt('Rename preset', preset.name) || preset.name)} aria-label={`Rename ${preset.name}`}><FiEdit2 /></button>
                                        <button onClick={() => shareUserPreset(preset)} aria-label={`Copy ${preset.name}`}><FiShare2 /></button>
                                        <button onClick={() => deleteUserPreset(preset.id)} aria-label={`Delete ${preset.name}`}><FiTrash2 /></button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}

                <section className="danger-zone">
                    <div><strong>Start over</strong><small>Remove tracks, presets, and saved settings.</small></div>
                    <button onClick={resetSession}>Reset session</button>
                </section>
            </div>
        </aside>
    );
};

export default Sidebar;
