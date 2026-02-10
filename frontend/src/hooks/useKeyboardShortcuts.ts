import { useEffect, useRef } from 'react';

interface KeyboardShortcutsProps {
    onPlayPause: () => void;
    onNext: () => void;
    onPrevious: () => void;
    onSeek: (delta: number) => void;
}

export const useKeyboardShortcuts = ({
    onPlayPause,
    onNext,
    onPrevious,
    onSeek,
}: KeyboardShortcutsProps) => {
    const callbacksRef = useRef({ onPlayPause, onNext, onPrevious, onSeek });

    useEffect(() => {
        callbacksRef.current = { onPlayPause, onNext, onPrevious, onSeek };
    }, [onPlayPause, onNext, onPrevious, onSeek]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input or textarea
            if (
                document.activeElement instanceof HTMLInputElement ||
                document.activeElement instanceof HTMLTextAreaElement ||
                (document.activeElement as HTMLElement)?.isContentEditable
            ) {
                return;
            }

            const { onPlayPause, onNext, onPrevious, onSeek } = callbacksRef.current;

            switch (e.code) {
                case 'Space':
                case 'KeyK': // YouTube style
                case 'MediaPlayPause':
                    e.preventDefault();
                    onPlayPause();
                    break;

                case 'MediaTrackNext':
                    e.preventDefault();
                    onNext();
                    break;

                case 'MediaTrackPrevious':
                    e.preventDefault();
                    onPrevious();
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    if (e.shiftKey) {
                        onNext();
                    } else {
                        onSeek(5);
                    }
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.shiftKey) {
                        onPrevious();
                    } else {
                        onSeek(-5);
                    }
                    break;

                case 'KeyJ': // YouTube style (seek back 10s)
                    e.preventDefault();
                    onSeek(-10);
                    break;

                case 'KeyL': // YouTube style (seek fwd 10s)
                    e.preventDefault();
                    onSeek(10);
                    break;

                case 'KeyN':
                    if (e.shiftKey) {
                        e.preventDefault();
                        onNext();
                    }
                    break;

                case 'KeyP':
                    if (e.shiftKey) {
                        e.preventDefault();
                        onPrevious();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
};
