import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, AlertCircle, Home } from 'lucide-react';

const FeatureDisabled = ({
  featureName = 'This feature',
  message = null,
  redirectPath = '/dashboard',
}) => {
  const defaultMessage = `${featureName} is currently not available. Please check back later or contact support if you believe this is an error.`;

  return (
    <div className="flex items-center justify-center min-h-screen bg-jf-bg px-4">
      <div className="max-w-md mx-auto text-center p-8 rounded-xl border border-cyan-500/20 bg-cyan-950/30 shadow-jf-card">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 rounded-full border border-cyan-400/35 bg-cyan-500/10 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-100 mb-2">Feature unavailable</h1>
          <p className="text-cyan-100/55 mb-6">{message || defaultMessage}</p>
        </div>

        <div className="space-y-3">
          <Link
            to={redirectPath}
            className="inline-flex items-center justify-center w-full px-4 py-2 rounded-lg border border-cyan-400/45 bg-cyan-500/15 text-cyan-50 hover:bg-cyan-500/20 transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Link>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center w-full px-4 py-2 rounded-lg border border-cyan-500/20 bg-transparent text-cyan-200/80 hover:bg-cyan-500/10 transition-colors"
          >
            Go Back
          </button>
        </div>

        <div className="mt-6 p-4 rounded-lg border border-cyan-500/15 bg-cyan-950/25 text-left">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-cyan-400 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-cyan-100/60">
              <p className="font-medium text-cyan-200/90">Need help?</p>
              <p>If you believe you should have access to this feature, please contact our support team.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeatureDisabled;
