import React, { useEffect, useRef, useState } from 'react';
import {
    FiCheck, FiChevronDown, FiGithub, FiHeart, FiMusic,
    FiSave, FiSearch, FiSliders, FiUploadCloud
} from 'react-icons/fi';
import { RiBugLine } from 'react-icons/ri';
import { AudioState, IconRenderer, Preset, UserPreset } from '../App';

interface TopbarProps {
    currentTrackName: string;
    audio: AudioState;
    selectedPreset: string;
    applyPreset: (name: string) => void;
    PRESETS: Preset[];
    userPresets: UserPreset[];
    presetNameInput: string;
    setPresetNameInput: (name: string) => void;
    saveUserPreset: () => void;
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    setShowBugModal: (show: boolean) => void;
    setBugMessage: (msg: string | null) => void;
    isStudioOpen: boolean;
    onOpenStudio: () => void;
    onOpenQueue: () => void;
}

const Topbar: React.FC<TopbarProps> = ({
    currentTrackName,
    audio,
    selectedPreset,
    applyPreset,
    PRESETS,
    userPresets,
    presetNameInput,
    setPresetNameInput,
    saveUserPreset,
    handleFileUpload,
    setShowBugModal,
    setBugMessage,
    isStudioOpen,
    onOpenStudio,
    onOpenQueue,
}) => {
    const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isPresetMenuOpen) return;
        const close = (event: MouseEvent | KeyboardEvent) => {
            if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
            if (event instanceof MouseEvent && menuRef.current?.contains(event.target as Node)) return;
            setIsPresetMenuOpen(false);
        };
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', close);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', close);
        };
    }, [isPresetMenuOpen]);

    const filteredFactoryPresets = PRESETS.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const filteredUserPresets = userPresets.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const selectedIcon = [...PRESETS, ...userPresets].find(p => p.name === selectedPreset)?.icon || 'sliders';

    return (
        <header className="topbar" aria-label="App bar">
            <a className="brand hoverable" href="#main-content" aria-label="SlowedLab home" title="SlowedLab — back to studio">
                <span className="brand-mark" aria-hidden="true"><img src="/logo-mark.svg" alt="" /></span>
                <span className="brand-copy">
                    <strong>SlowedLab</strong>
                    <small>Browser audio studio</small>
                </span>
            </a>

            <button
                className="topbar-session hoverable"
                onClick={onOpenQueue}
                title={audio.playlist.length ? `Open queue — ${audio.playlist.length} track${audio.playlist.length === 1 ? '' : 's'}` : 'Queue is empty — add audio to begin'}
                aria-label={audio.playlist.length ? `Open queue, ${audio.playlist.length} tracks` : 'Open queue'}
            >
                <span className={`session-dot ${audio.isPlaying ? 'playing' : ''}`} aria-hidden="true" />
                <span className="topbar-track-name">{currentTrackName}</span>
                <span className="topbar-track-count">{audio.playlist.length || 0} in queue</span>
            </button>

            <nav className="topbar-actions" aria-label="Studio actions">
                <div className="preset-menu" ref={menuRef}>
                    <button
                        className="preset-trigger hoverable"
                        onClick={() => setIsPresetMenuOpen(open => !open)}
                        aria-expanded={isPresetMenuOpen}
                        aria-controls="preset-menu"
                        title="Choose a sound preset"
                    >
                        <IconRenderer icon={selectedIcon} size={17} />
                        <span>{selectedPreset}</span>
                        <FiChevronDown className={isPresetMenuOpen ? 'rotated' : ''} aria-hidden="true" />
                    </button>

                    {isPresetMenuOpen && (
                        <section id="preset-menu" className="preset-dropdown" aria-label="Choose a preset">
                            <div className="preset-dropdown-heading">
                                <div>
                                    <strong>Presets</strong>
                                    <span>Start with a sound, then tune it.</span>
                                </div>
                            </div>
                            <label className="preset-search">
                                <FiSearch aria-hidden="true" />
                                <span className="sr-only">Search presets</span>
                                <input
                                    type="search"
                                    placeholder="Search presets"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </label>
                            <div className="preset-list">
                                {filteredFactoryPresets.length > 0 && <p className="menu-label">Built in</p>}
                                {filteredFactoryPresets.map((preset) => (
                                    <button
                                        key={preset.name}
                                        className={`preset-option hoverable ${selectedPreset === preset.name ? 'active' : ''}`}
                                        title={preset.description}
                                        onClick={() => {
                                            applyPreset(preset.name);
                                            setIsPresetMenuOpen(false);
                                        }}
                                    >
                                        <span className="preset-option-icon"><IconRenderer icon={preset.icon} /></span>
                                        <span className="preset-option-copy">
                                            <strong>{preset.name}</strong>
                                            <small>{preset.description}</small>
                                        </span>
                                        {selectedPreset === preset.name && <FiCheck aria-label="Selected" />}
                                    </button>
                                ))}

                                {filteredUserPresets.length > 0 && <p className="menu-label">Saved by you</p>}
                                {filteredUserPresets.map((preset) => (
                                    <button
                                        key={preset.id}
                                        className={`preset-option hoverable ${selectedPreset === preset.name ? 'active' : ''}`}
                                        title="Your saved preset"
                                        onClick={() => {
                                            applyPreset(preset.name);
                                            setIsPresetMenuOpen(false);
                                        }}
                                    >
                                        <span className="preset-option-icon"><FiMusic /></span>
                                        <span className="preset-option-copy"><strong>{preset.name}</strong><small>Custom preset</small></span>
                                        {selectedPreset === preset.name && <FiCheck aria-label="Selected" />}
                                    </button>
                                ))}

                                {filteredFactoryPresets.length === 0 && filteredUserPresets.length === 0 && (
                                    <p className="preset-empty">No presets match “{searchQuery}”.</p>
                                )}
                            </div>
                            <div className="preset-save">
                                <label htmlFor="preset-name">Save current mix</label>
                                <div>
                                    <input
                                        id="preset-name"
                                        value={presetNameInput}
                                        onChange={(e) => setPresetNameInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveUserPreset()}
                                        placeholder="Preset name"
                                        maxLength={32}
                                    />
                                    <button className="hoverable" onClick={saveUserPreset} aria-label="Save current preset" title="Save current mix as a preset"><FiSave /></button>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                <button
                    className={`topbar-button studio-action hoverable ${isStudioOpen ? 'active' : ''}`}
                    onClick={onOpenStudio}
                    aria-expanded={isStudioOpen}
                    aria-controls="effects-title"
                    title="Open studio — tune speed, space, bass and more"
                >
                    <FiSliders aria-hidden="true" />
                    <span>Studio</span>
                </button>

                <label className="topbar-button upload-action hoverable" title="Add audio files from your device">
                    <FiUploadCloud aria-hidden="true" />
                    <span>Add audio</span>
                    <input type="file" accept="audio/*" multiple onChange={handleFileUpload} />
                </label>

                <div className="utility-actions">
                    <a className="hoverable" href="https://ko-fi.com/gwhyyy" target="_blank" rel="noreferrer" aria-label="Support SlowedLab" title="Support SlowedLab"><FiHeart /></a>
                    <a className="hoverable" href="https://github.com/anasfik/SlowedLab" target="_blank" rel="noreferrer" aria-label="View source on GitHub" title="View source on GitHub"><FiGithub /></a>
                    <button
                        className="hoverable"
                        onClick={() => {
                            setShowBugModal(true);
                            setBugMessage(null);
                        }}
                        aria-label="Report a problem"
                        title="Report a problem"
                    ><RiBugLine /></button>
                </div>
            </nav>
        </header>
    );
};

export default Topbar;
