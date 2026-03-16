# Database Migrations with Alembic

This directory contains database migration scripts managed by Alembic.

## Setup

1. Install alembic if not already installed:
   ```bash
   pip install alembic
   ```

2. Alembic is already configured to use the Flask app's database URL.

## Common Commands

### Create a new migration (auto-generate from model changes)
```bash
alembic revision --autogenerate -m "Description of changes"
```

### Apply all pending migrations
```bash
alembic upgrade head
```

### Rollback last migration
```bash
alembic downgrade -1
```

### View migration history
```bash
alembic history
```

### View current database version
```bash
alembic current
```

### Generate SQL without executing (for review)
```bash
alembic upgrade head --sql
```

## Workflow

1. **Make model changes** in `models.py`
2. **Generate migration**: `alembic revision --autogenerate -m "Add new field"`
3. **Review the generated migration** in `migrations/versions/`
4. **Apply migration**: `alembic upgrade head`
5. **Commit migration file** to version control

## Important Notes

- Always review auto-generated migrations before applying
- Test migrations on a development database first
- Migrations are tracked in the `alembic_version` table
- Never delete migrations that have been applied to production
