import React, { useState, useEffect, useMemo } from 'react';
import { ExampleItem } from '../../forge.env';
import { loadExampleContent } from '../utils/exampleContent';

interface ExamplesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoadExample: (content: string, name: string) => void;
    onImportExample: (content: string, name: string) => void;
}

const CATEGORIES = [
    { key: 'all', label: 'All Presets' },
    // B6-3: the curated first-hour list (src/main/startHere.ts) leads.
    { key: 'start-here', label: '🚀 Start Here' },
    { key: 'songs', label: '🎵 Songs & Loops' },
    { key: 'instruments', label: '🎹 Instruments' },
    { key: 'snes-kit', label: '🎮 SNES Kit' },
    { key: 'sound-effects', label: '💥 Sound Effects' },
];

export const ExamplesModal: React.FC<ExamplesModalProps> = ({
    isOpen,
    onClose,
    onLoadExample,
    onImportExample,
}) => {
    const [examples, setExamples] = useState<ExampleItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        const fetchExamples = async () => {
            setLoading(true);
            setError(null);
            try {
                let items: ExampleItem[] = [];
                if (window.electron?.listExamples) {
                    items = await window.electron.listExamples();
                } else {
                    const res = await fetch('/api/examples');
                    if (res.ok) {
                        items = await res.json();
                    }
                }
                if (active) {
                    setExamples(items || []);
                }
            } catch (err) {
                if (active) {
                    setError(err instanceof Error ? err.message : 'Failed to load examples list');
                }
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchExamples();
        return () => {
            active = false;
        };
    }, [isOpen]);

    const filteredExamples = useMemo(() => {
        return examples.filter((item) => {
            const matchesCategory =
                selectedCategory === 'all' || item.categoryKey === selectedCategory;
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch =
                !q ||
                item.name.toLowerCase().includes(q) ||
                (item.subcategory && item.subcategory.toLowerCase().includes(q)) ||
                item.category.toLowerCase().includes(q);
            return matchesCategory && matchesSearch;
        });
    }, [examples, selectedCategory, searchQuery]);

    const handleFetchAndAction = async (
        item: ExampleItem,
        action: 'load' | 'import'
    ) => {
        setActionInProgress(`${action}:${item.id}`);
        try {
            // One loader for every example read (utils/exampleContent.ts); the
            // first-run patch (B6-6) goes through the same two branches.
            const content = await loadExampleContent(item.path);
            if (content) {
                if (action === 'load') {
                    onLoadExample(content, item.name);
                    onClose();
                } else {
                    onImportExample(content, item.name);
                    onClose();
                }
            } else {
                alert(`Could not load example: ${item.name}`);
            }
        } catch (e) {
            alert(`Failed to load ${item.name}: ${e instanceof Error ? e.message : e}`);
        } finally {
            setActionInProgress(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: 20,
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                style={{
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #444',
                    borderRadius: 8,
                    width: '850px',
                    maxWidth: '95vw',
                    height: '80vh',
                    maxHeight: '750px',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.75)',
                    color: '#E0E0E0',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#252526',
                    }}
                >
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25em', color: '#FFF' }}>
                            Examples & Preset Library
                        </h2>
                        <span style={{ fontSize: '0.85em', color: '#888' }}>
                            Browse and load curated demo songs, synth patches, and sound effects
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#AAA',
                            fontSize: '1.4em',
                            cursor: 'pointer',
                            padding: '4px 8px',
                            borderRadius: 4,
                        }}
                        title="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Filters Bar */}
                <div
                    style={{
                        padding: '12px 20px',
                        borderBottom: '1px solid #2D2D2D',
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        backgroundColor: '#222',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.key}
                                onClick={() => setSelectedCategory(cat.key)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 4,
                                    fontSize: '0.85em',
                                    fontWeight: selectedCategory === cat.key ? 'bold' : 'normal',
                                    backgroundColor:
                                        selectedCategory === cat.key ? '#3182CE' : '#333',
                                    color: selectedCategory === cat.key ? '#FFF' : '#AAA',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.15s',
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="Search presets..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: '#1E1E1E',
                            border: '1px solid #444',
                            borderRadius: 4,
                            color: '#FFF',
                            fontSize: '0.9em',
                            width: '200px',
                            outline: 'none',
                        }}
                    />
                </div>

                {/* Content Area */}
                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: 20,
                        backgroundColor: '#181818',
                    }}
                >
                    {loading && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: 40,
                                color: '#888',
                            }}
                        >
                            Loading examples library...
                        </div>
                    )}

                    {error && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: 30,
                                color: '#FC8181',
                            }}
                        >
                            Error loading examples: {error}
                        </div>
                    )}

                    {!loading && !error && filteredExamples.length === 0 && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: 40,
                                color: '#777',
                            }}
                        >
                            No examples found matching &quot;{searchQuery}&quot;.
                        </div>
                    )}

                    {!loading && !error && filteredExamples.length > 0 && (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                                gap: 14,
                            }}
                        >
                            {filteredExamples.map((item) => {
                                const isLoadingThis =
                                    actionInProgress === `load:${item.id}`;
                                const isImportingThis =
                                    actionInProgress === `import:${item.id}`;

                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            backgroundColor: '#252526',
                                            border: '1px solid #383838',
                                            borderRadius: 6,
                                            padding: 14,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            transition: 'border-color 0.15s, transform 0.15s',
                                        }}
                                    >
                                        <div>
                                            <div
                                                style={{
                                                    fontSize: '1em',
                                                    fontWeight: '600',
                                                    color: '#F0F0F0',
                                                    marginBottom: 6,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title={item.name}
                                            >
                                                {item.name}
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    gap: 6,
                                                    flexWrap: 'wrap',
                                                    alignItems: 'center',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: '0.75em',
                                                        backgroundColor: '#384252',
                                                        color: '#90CDF4',
                                                        padding: '2px 6px',
                                                        borderRadius: 3,
                                                    }}
                                                >
                                                    {item.category}
                                                </span>
                                                {item.subcategory && (
                                                    <span
                                                        style={{
                                                            fontSize: '0.75em',
                                                            backgroundColor: '#2D3748',
                                                            color: '#CBD5E0',
                                                            padding: '2px 6px',
                                                            borderRadius: 3,
                                                        }}
                                                    >
                                                        {item.subcategory}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 8,
                                                marginTop: 4,
                                            }}
                                        >
                                            <button
                                                onClick={() => handleFetchAndAction(item, 'load')}
                                                disabled={Boolean(actionInProgress)}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px 8px',
                                                    fontSize: '0.8em',
                                                    fontWeight: '600',
                                                    backgroundColor: '#3182CE',
                                                    color: '#FFF',
                                                    border: 'none',
                                                    borderRadius: 4,
                                                    cursor: actionInProgress ? 'not-allowed' : 'pointer',
                                                    opacity: isLoadingThis ? 0.7 : 1,
                                                }}
                                                title="Open this example project (replaces current graph)"
                                            >
                                                {isLoadingThis ? 'Loading...' : 'Load Project'}
                                            </button>
                                            <button
                                                onClick={() => handleFetchAndAction(item, 'import')}
                                                disabled={Boolean(actionInProgress)}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px 8px',
                                                    fontSize: '0.8em',
                                                    fontWeight: '600',
                                                    backgroundColor: '#4A5568',
                                                    color: '#FFF',
                                                    border: 'none',
                                                    borderRadius: 4,
                                                    cursor: actionInProgress ? 'not-allowed' : 'pointer',
                                                    opacity: isImportingThis ? 0.7 : 1,
                                                }}
                                                title="Import this patch into current graph"
                                            >
                                                {isImportingThis ? 'Importing...' : 'Import Patch'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: '10px 20px',
                        borderTop: '1px solid #333',
                        backgroundColor: '#252526',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8em',
                        color: '#777',
                    }}
                >
                    <span>{filteredExamples.length} example{filteredExamples.length === 1 ? '' : 's'} available</span>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '4px 12px',
                            backgroundColor: '#4A5568',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                        }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExamplesModal;
