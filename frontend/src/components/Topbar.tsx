import React, { useEffect, useRef, useState } from 'react';
import {
    FiCheck, FiChevronDown, FiDownload, FiGithub, FiHeart, FiMusic,
    FiSave, FiSearch, FiUploadCloud
} from 'react-icons/fi';
import { RiBugLine } from 'react-icons/ri';
import { AudioFile, AudioState, IconRenderer, Preset, UserPreset } from '../App';

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
    exportSelection: () => void;
    isExporting: boolean;
    setShowBugModal: (show: boolean) => void;
    setBugMessage: (msg: string | null) => void;
    currentTrack: AudioFile | null;
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
    exportSelection,
    isExporting,
    setShowBugModal,
    setBugMessage,
    currentTrack,
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
        <header className="topbar">
            <a className="brand" href="#main-content" aria-label="SlowedLab home">
                <span className="brand-mark" aria-hidden="true"><img src="/logo-mark.svg" alt="" /></span>
                <span className="brand-copy">
                    <strong>SlowedLab</strong>
                    <small>Browser audio studio</small>
                </span>
            </a>

            <div className="topbar-session" aria-live="polite">
                <span className={`session-dot ${audio.isPlaying ? 'playing' : ''}`} aria-hidden="true" />
                <span className="topbar-track-name">{currentTrackName}</span>
                <span className="topbar-track-count">{audio.playlist.length || 0} in queue</span>
            </div>

            <nav className="topbar-actions" aria-label="Studio actions">
                <div className="preset-menu" ref={menuRef}>
                    <button
                        className="preset-trigger"
                        onClick={() => setIsPresetMenuOpen(open => !open)}
                        aria-expanded={isPresetMenuOpen}
                        aria-controls="preset-menu"
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
                                        className={`preset-option ${selectedPreset === preset.name ? 'active' : ''}`}
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
                                        className={`preset-option ${selectedPreset === preset.name ? 'active' : ''}`}
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
                                    <button onClick={saveUserPreset} aria-label="Save current preset"><FiSave /></button>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                <label className="topbar-button upload-action">
                    <FiUploadCloud aria-hidden="true" />
                    <span>Add audio</span>
                    <input type="file" accept="audio/*" multiple onChange={handleFileUpload} />
                </label>
                <button className="topbar-button export-action" onClick={exportSelection} disabled={!currentTrack?.buffer || isExporting}>
                    <FiDownload aria-hidden="true" />
                    <span>{isExporting ? 'Rendering…' : 'Export mix'}</span>
                </button>

                <div className="utility-actions">
                    <a href="https://ko-fi.com/gwhyyy" target="_blank" rel="noreferrer" aria-label="Support SlowedLab"><FiHeart /></a>
                    <a href="https://github.com/anasfik/SlowedLab" target="_blank" rel="noreferrer" aria-label="View source on GitHub"><FiGithub /></a>
                    <button
                        onClick={() => {
                            setShowBugModal(true);
                            setBugMessage(null);
                        }}
                        aria-label="Report a problem"
                    ><RiBugLine /></button>
                </div>
            </nav>
        </header>
    );
};

export default Topbar;
