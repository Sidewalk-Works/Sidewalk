# Adding a New Module to the FastAPI Backend

This guide walks through creating and registering a new domain module within the Sidewalk FastAPI backend (`apps/api`).

By adhering to the modular monolith pattern, each domain module maintains strict boundaries and clear separation of concerns.

---

## 1. Directory Structure

All business modules live in `apps/api/src/modules/<module_name>/`. A complete module contains:

```text
apps/api/src/modules/<module_name>/
├── __init__.py           # Exports public router, models, and service interfaces
├── models.py             # SQLAlchemy 2.0 ORM models inheriting from Base
├── schemas.py            # Pydantic v2 request/response schemas
├── repository.py         # Database query logic (encapsulates SQLAlchemy queries)
├── service.py            # Domain business logic and orchestrations
├── router.py             # FastAPI APIRouter and route definitions
└── dependencies.py       # (Optional) Module-specific FastAPI Depends providers
```

---

## 2. Module Boundary Rules

To preserve codebase maintainability and prevent spaghetti dependencies, strictly observe these rules:

1. **Services never import other services directly:**
   - Cross-module operations must go through public interfaces, events, or shared core utilities.
   - If Module A needs data from Module B, query through repository interfaces or dispatch domain events rather than calling Module B's internal service methods.

2. **Repositories never call `commit()`:**
   - Repositories only add, query, or stage changes on the session (`session.add()`, `session.execute()`, etc.).
   - The caller (service layer or route dependency) is responsible for committing transactions (`await session.commit()`). This ensures atomic multi-repository operations.

3. **Routes contain no business logic:**
   - Route functions (`router.get`, `router.post`) are transport adapters only.
   - Routes unpack request schemas/parameters, invoke the service function, and return response schemas.
   - HTTP status codes, exceptions, and validation are mapped cleanly between the service and router.

4. **Public interfaces exposed via `__init__.py`:**
   - Modules should expose their router and public models in `__init__.py`:
     ```python
     from src.modules.<module_name>.router import router

     __all__ = ["router"]
     ```

---

## 3. Step-by-Step Walkthrough

### Step 3.1: Define Models (`models.py`)

Define your SQLAlchemy model inheriting from `Base`, `UUIDPKMixin`, and `TimestampMixin` from `src.core.models`:

```python
import uuid
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.models import Base, TimestampMixin, UUIDPKMixin

class Item(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "items"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
```

Export your new model in `apps/api/src/models.py` so Alembic discovers it automatically during autogenerate:

```python
from src.modules.<module_name>.models import Item  # noqa: F401
```

### Step 3.2: Create Alembic Migration

Generate and apply the migration:

```bash
cd apps/api
uv run alembic revision --autogenerate -m "add items table"
uv run alembic upgrade head
```

Verify that no schema drift remains:

```bash
uv run alembic check
```

### Step 3.3: Define Schemas (`schemas.py`)

Define input and output Pydantic models:

```python
import uuid
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class ItemCreate(BaseModel):
    title: str
    description: str

class ItemResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

### Step 3.4: Implement Service & Repository

In `service.py`:

```python
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from src.modules.<module_name>.models import Item
from src.modules.<module_name>.schemas import ItemCreate

async def create_item(db: AsyncSession, data: ItemCreate, user_id: uuid.UUID) -> Item:
    item = Item(title=data.title, description=data.description, user_id=user_id)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item
```

### Step 3.5: Define Router (`router.py`)

```python
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db
from src.core.dependencies import CurrentUser
from src.modules.<module_name> import schemas, service

router = APIRouter(prefix="/items", tags=["items"])

@router.post("", response_model=schemas.ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: schemas.ItemCreate,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    return await service.create_item(db, payload, current_user.id)
```

### Step 3.6: Register Router in `src/main.py`

In `apps/api/src/main.py`:

```python
from src.modules.<module_name> import router as <module_name>_router

# Inside create_app():
app.include_router(<module_name>_router, prefix="/api")
```

---

## 4. Writing Integration Tests

Add test files under `apps/api/tests/integration/test_<module_name>_routes.py`:

```python
import pytest
from httpx import AsyncClient

async def test_create_item_success(auth_client: AsyncClient):
    response = await auth_client.post(
        "/api/items",
        json={"title": "Pothole on 5th", "description": "Needs repaving"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Pothole on 5th"
    assert "id" in data

async def test_create_item_unauthenticated(client: AsyncClient):
    response = await client.post(
        "/api/items",
        json={"title": "Unauthenticated item", "description": "Should fail"},
    )
    assert response.status_code == 401
```

Run test suite:

```bash
uv run pytest tests/integration/test_<module_name>_routes.py
```
