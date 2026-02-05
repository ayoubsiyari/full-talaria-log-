import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, AlertCircle, Home } from 'lucide-react';

/**
 * Component shown when a feature is disabled
 * @param {Object} props - Component props
 * @param {string} props.featureName - Name of the disabled feature
 * @param {string} props.message - Custom message to display
 * @param {string} props.redirectPath - Path to redirect to (default: /dashboard)
 */
const FeatureDisabled = ({ 
  featureName = 'This feature', 
  message = null, 
  redirectPath = '/dashboard' 
}) => {
  const defaultMessage = `${featureName} is currently not available. Please check back later or contact support if you believe this is an error.`;

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="max-w-md mx-auto text-center p-8">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Feature Unavailable
          </h1>
          <p className="text-gray-600 mb-6">
            {message || defaultMessage}
          </p>
        </div>
        
        <div className="space-y-3">
          <Link
            to={redirectPath}
            className="inline-flex items-center justify-center w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Link>
          
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Go Back
          </button>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Need help?</p>
              <p>If you believe you should have access to this feature, please contact our support team.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeatureDisabled; 