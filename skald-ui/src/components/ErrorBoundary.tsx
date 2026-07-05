import React from 'react';

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * Top-level error boundary. Without one, ANY render throw white-screened
 * the whole editor and lost the unsaved graph. This catches the error,
 * keeps React alive, and gives the user a way to recover (dismiss and
 * keep working, or reload).
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[Skald] Uncaught render error:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div style={{
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#1a1a1a',
                    color: '#E0E0E0',
                    fontFamily: 'sans-serif',
                    padding: 24,
                    gap: 12,
                }}>
                    <h2 style={{ margin: 0 }}>Something went wrong</h2>
                    <pre style={{
                        maxWidth: '80%',
                        maxHeight: 200,
                        overflow: 'auto',
                        background: '#111',
                        padding: 12,
                        borderRadius: 6,
                        color: '#ff8080',
                    }}>{String(this.state.error?.stack || this.state.error)}</pre>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            style={{ padding: '8px 16px', cursor: 'pointer' }}
                            onClick={() => this.setState({ error: null })}
                        >
                            Try to continue
                        </button>
                        <button
                            style={{ padding: '8px 16px', cursor: 'pointer' }}
                            onClick={() => window.location.reload()}
                        >
                            Reload editor
                        </button>
                    </div>
                    <small style={{ color: '#888' }}>
                        Your graph state is still in memory — “Try to continue” usually recovers it.
                    </small>
                </div>
            );
        }
        return this.props.children;
    }
}
