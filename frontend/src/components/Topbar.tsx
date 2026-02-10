import React, { useState } from 'react';
import {
    FiPlay, FiPause, FiDownload, FiGithub, FiMusic, FiSave,
    FiAlertCircle, FiChevronDown, FiSearch, FiCheck
} from 'react-icons/fi';
import { RiBugLine } from 'react-icons/ri';
import { AudioState, UserPreset, Preset, IconRenderer } from '../App';

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
    setShowBugModal: (show: boolean) => void;
    setBugMessage: (msg: string | null) => void;
    togglePlayback: () => void;
    currentTrack: any; // Using any to avoid importing AudioFile interface circular dependency if not exported
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
    setShowBugModal,
    setBugMessage,
    togglePlayback,
    currentTrack,
}) => {
    const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredFactoryPresets = PRESETS.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredUserPresets = userPresets.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <header className="topbar">
            <div className="topbar-left">
                <div className="topbar-branding">
                    <h1 className="page-title">Audio Processing Console</h1>
                    <p className="eyebrow">{currentTrackName}</p>
                </div>
            </div>

            <div className="topbar-actions">
                {/* GitHub Button */}
                <button
                    className="topbar-icon-button"
                    onClick={() => window.open('https://github.com/anasfik/SlowedLab', '_blank')}
                    title="View source on GitHub"
                    aria-label="Open GitHub repository"
                >
                    <FiGithub size={20} />
                </button>

                {/* Status Indicators */}
                <div className="topbar-section topbar-status">
                    <div className="status-chip status-track">
                        <span className="status-icon"><FiMusic /></span>
                        <span>
                            {audio.playlist.length} {audio.playlist.length === 1 ? 'Track' : 'Tracks'}
                        </span>
                    </div>
                    {audio.isPlaying && (
                        <div className="status-chip status-live">
                            <span className="status-pulse"></span>
                            <span>Live</span>
                        </div>
                    )}
                </div>

                {/* Custom Preset Management */}
                <div className="topbar-section topbar-presets">
                    <div className="custom-dropdown-container">
                        <button
                            className="preset-trigger glass-panel"
                            onClick={() => setIsPresetMenuOpen(!isPresetMenuOpen)}
                            title="Open Presets Menu"
                        >
                            <div className="trigger-left">
                                <IconRenderer icon={PRESETS.find(p => p.name === selectedPreset)?.icon || 'sliders'} />
                                <span className="current-preset-name">{selectedPreset}</span>
                            </div>
                            <FiChevronDown className={`chevron ${isPresetMenuOpen ? 'open' : ''}`} />
                        </button>

                        {isPresetMenuOpen && (
                            <div className="preset-dropdown-menu glass-panel floating-menu animate-in">
                                <div className="dropdown-search">
                                    <FiSearch size={14} />
                                    <input
                                        type="text"
                                        placeholder="Search presets..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                </div>
                                <div className="dropdown-scroll custom-scrollbar">
                                    {filteredFactoryPresets.length > 0 && (
                                        <>
                                            <header className="dropdown-label">Factory Presets</header>
                                            {filteredFactoryPresets.map((preset) => (
                                                <button
                                                    key={preset.name}
                                                    className={`dropdown-item ${selectedPreset === preset.name ? 'active' : ''}`}
                                                    onClick={() => {
                                                        applyPreset(preset.name);
                                                        setIsPresetMenuOpen(false);
                                                    }}
                                                >
                                                    <div className="item-icon-box">
                                                        <IconRenderer icon={preset.icon} />
                                                    </div>
                                                    <div className="item-details">
                                                        <span className="item-name">{preset.name}</span>
                                                        <span className="item-desc">{preset.description}</span>
                                                    </div>
                                                    {selectedPreset === preset.name && <FiCheck className="active-check" />}
                                                </button>
                                            ))}
                                        </>
                                    )}

                                    {filteredUserPresets.length > 0 && (
                                        <>
                                            <header className="dropdown-label">Your Library</header>
                                            {filteredUserPresets.map((preset) => (
                                                <button
                                                    key={preset.id}
                                                    className={`dropdown-item ${selectedPreset === preset.name ? 'active' : ''}`}
                                                    onClick={() => {
                                                        applyPreset(preset.name);
                                                        setIsPresetMenuOpen(false);
                                                    }}
                                                >
                                                    <div className="item-icon-box library">
                                                        <FiMusic />
                                                    </div>
                                                    <div className="item-details">
                                                        <span className="item-name">{preset.name}</span>
                                                        <span className="item-desc">User Created</span>
                                                    </div>
                                                    {selectedPreset === preset.name && <FiCheck className="active-check" />}
                                                </button>
                                            ))}
                                        </>
                                    )}

                                    {filteredFactoryPresets.length === 0 && filteredUserPresets.length === 0 && (
                                        <div className="dropdown-empty">
                                            No presets found for "{searchQuery}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="preset-actions">
                        <div className="preset-save-group">
                            <input
                                type="text"
                                value={presetNameInput}
                                onChange={(e) => setPresetNameInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && saveUserPreset()}
                                placeholder="Name your vibe..."
                                className="preset-input-inline"
                                maxLength={32}
                            />
                            <button
                                className="icon-btn icon-btn-primary"
                                onClick={saveUserPreset}
                                title="Save current settings as preset (Enter)"
                            >
                                <FiSave />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="topbar-divider"></div>

                {/* File Actions */}
                <div className="topbar-section topbar-file-actions">
                    <label className="icon-btn icon-btn-secondary" title="Upload audio files">
                        <FiPlay style={{ transform: 'rotate(180deg)' }} />
                        <input
                            type="file"
                            accept="audio/*"
                            multiple
                            onChange={handleFileUpload}
                            className="file-input"
                        />
                    </label>
                    <button
                        className="icon-btn icon-btn-secondary"
                        onClick={exportSelection}
                        disabled={!currentTrack?.buffer}
                        title="Export audio"
                    >
                        <FiDownload />
                    </button>
                    <button
                        className="icon-btn"
                        onClick={() => {
                            setShowBugModal(true);
                            setBugMessage(null);
                        }}
                        title="Report a bug"
                    >
                        <RiBugLine />
                    </button>
                </div>

                {/* Playback Controls */}
                <div className="topbar-section topbar-playback">
                    <button
                        className="btn-playback"
                        onClick={togglePlayback}
                        disabled={!currentTrack?.buffer || currentTrack?.isLoading}
                        title={audio.isPlaying ? 'Pause' : 'Play'}
                    >
                        {audio.isPlaying ? (
                            <>
                                <FiPause />
                                <span>Pause</span>
                            </>
                        ) : (
                            <>
                                <FiPlay />
                                <span>Play</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Topbar;
