"""Helpers for Strategy Builder JSON (conditions / variables)."""

MAX_NAME_LEN = 100
MAX_DESC_LEN = 5000
# Max length of data-URL string stored in JSON (client compresses before send).
MAX_COVER_IMAGE_LEN = 800_000


def _sanitize_cover_image(val):
    """Allow only safe data-URL images (no SVG) for strategy_definition.cover_image."""
    if not isinstance(val, str) or not val.strip():
        return ''
    val = val.strip()
    if len(val) > MAX_COVER_IMAGE_LEN:
        return ''
    if not val.startswith('data:image/'):
        return ''
    allowed_prefixes = (
        'data:image/jpeg',
        'data:image/jpg',
        'data:image/png',
        'data:image/webp',
        'data:image/gif',
    )
    low = val[:32].lower()
    if not any(low.startswith(p) for p in allowed_prefixes):
        return ''
    return val


def default_strategy_definition():
    return {
        'instrument': '',
        'style': '',
        'direction': 'both',
        'timeframe': '',
        'conditions': [],
        'variables': [],
        'cover_image': '',
    }


def merge_definition_from_legacy(strategy_row):
    """If strategy_definition is empty but legacy entry_rules exist, build a minimal definition."""
    d = getattr(strategy_row, 'strategy_definition', None)
    if d is None:
        d = {}
    if not isinstance(d, dict):
        d = {}
    out = default_strategy_definition()
    out.update(d)
    if (not out.get('conditions')) and strategy_row.entry_rules:
        rules = strategy_row.entry_rules or []
        if isinstance(rules, list) and rules:
            cat_id = 'legacy_cat'
            out['conditions'] = [
                {
                    'type': 'category',
                    'id': cat_id,
                    'label': 'LEGACY',
                    'color': '#06b6d4',
                    'bg': 'rgba(6,182,212,0.12)',
                    'bd': '#06b6d4',
                },
            ]
            for i, line in enumerate(rules):
                if not line:
                    continue
                out['conditions'].append({
                    'type': 'condition',
                    'id': f'legacy_{i}',
                    'catId': cat_id,
                    'name': str(line),
                    'note': '',
                    'ctype': 'yesno',
                    'options': [],
                })
    out['cover_image'] = _sanitize_cover_image(out.get('cover_image'))
    return out


def normalize_strategy_payload(data):
    """Accept camelCase or snake_case; return dict for Strategy model fields."""
    if not data:
        return {}

    name = data.get('name')
    description = data.get('description', '')

    # Legacy keys from old frontend
    entry_rules = data.get('entry_rules')
    if entry_rules is None and data.get('entryRules') is not None:
        entry_rules = data['entryRules']
    exit_rules = data.get('exit_rules')
    if exit_rules is None and data.get('exitRules') is not None:
        exit_rules = data['exitRules']

    risk = data.get('risk_management')
    if risk is None:
        risk = data.get('riskManagement', {})

    defn = data.get('strategy_definition')
    if defn is None:
        defn = data.get('strategyDefinition')

    if defn is None:
        defn = default_strategy_definition()
        # Allow flat metadata
        for key in ('instrument', 'style', 'direction', 'timeframe'):
            if data.get(key) is not None:
                defn[key] = data[key]
        if data.get('conditions') is not None:
            defn['conditions'] = data['conditions']
        if data.get('variables') is not None:
            defn['variables'] = data['variables']

    if not isinstance(defn, dict):
        defn = default_strategy_definition()

    # Merge defaults
    base = default_strategy_definition()
    base.update(defn)
    base['cover_image'] = _sanitize_cover_image(base.get('cover_image'))

    return {
        'name': name,
        'description': description,
        'entry_rules': entry_rules if entry_rules is not None else [],
        'exit_rules': exit_rules if exit_rules is not None else [],
        'risk_management': risk if isinstance(risk, dict) else {},
        'strategy_definition': base,
    }
