import React from 'react';

/**
 * Contains a render failure to one subtree.
 *
 * React 18 unmounts the *entire* tree when an error escapes a component and nothing catches
 * it. With no boundary anywhere in the app, a single throw inside the map took the whole
 * trip-planning wizard down with it and the user lost their in-progress route — which is what
 * "adding a note crashes the TripLink" actually was, whatever the underlying throw turned out
 * to be. Fixing individual causes doesn't remove that blast radius; this does.
 *
 * The fallback deliberately shows the error text: a TestFlight build has no readable console
 * without a Mac, so this is the only way a failure on the phone can be reported back.
 */
interface Props {
  children: React.ReactNode;
  /** Short description of what failed, e.g. "map". */
  label?: string;
  onError?: (error: Error) => void;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    this.props.onError?.(error);
  }

  private handleRetry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const label = this.props.label ?? 'component';
    return (
      <div className="error-boundary-fallback" role="alert">
        <div className="error-boundary-title">The {label} stopped working</div>
        <p className="error-boundary-body">
          The rest of your trip is safe — anything you&apos;ve already entered has been kept.
        </p>
        {/* user-select is enabled in CSS so this can be copied off a phone. */}
        <pre className="error-boundary-detail">{error.message || String(error)}</pre>
        <button type="button" className="error-boundary-retry" onClick={this.handleRetry}>
          Try again
        </button>
      </div>
    );
  }
}
