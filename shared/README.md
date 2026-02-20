# Shared Constants

This folder contains shared constants and configuration values used across all services in the Talaria platform.

## Files

### `constants.json`

Central configuration file containing:

- **app** - Application metadata (name, version, domain)
- **storage_keys** - LocalStorage key names for frontend
- **feature_flags** - Feature flag categories and names
- **api_endpoints** - All API endpoint paths
- **defaults** - Default values for various settings
- **limits** - System limits (file sizes, timeouts, etc.)
- **instrument_types** - Supported trading instruments
- **trade_directions** - Trade direction options
- **profile_modes** - Profile mode options
- **user_roles** - User role types
- **account_types** - Account type options

## Usage

### JavaScript/TypeScript (Frontend)

```javascript
import constants from '../../shared/constants.json';

// Use storage keys
localStorage.setItem(constants.storage_keys.AUTH_TOKEN, token);

// Use API endpoints
fetch(constants.api_endpoints.auth.login);

// Check feature flags
if (constants.feature_flags.core.includes('dashboard')) {
  // ...
}
```

### Python (Backend)

```python
import json
import os

# Load constants
constants_path = os.path.join(os.path.dirname(__file__), '..', 'shared', 'constants.json')
with open(constants_path) as f:
    CONSTANTS = json.load(f)

# Use values
token_expiry = CONSTANTS['limits']['token_expiry_hours']
```

## Updating Constants

1. Edit `constants.json`
2. Restart services to pick up changes
3. For frontend, rebuild the application

## Benefits

- **Single Source of Truth** - All services use the same values
- **Easy Updates** - Change in one place, affects all services
- **Documentation** - Self-documenting configuration
- **Type Safety** - Can generate TypeScript types from JSON schema
