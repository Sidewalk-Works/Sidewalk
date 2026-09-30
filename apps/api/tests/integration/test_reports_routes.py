from httpx import AsyncClient


async def register_and_login(
    client: AsyncClient, email: str = "reporter@example.com", password: str = "testpassword123"
) -> tuple[str, dict]:
    reg_res = await client.post("/api/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201, reg_res.text
    login_res = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    user = login_res.json()["user"]
    return token, user


async def test_create_report_authenticated(client: AsyncClient):
    token, user = await register_and_login(client, "rep_auth@example.com")
    payload = {
        "title": "Broken Streetlight",
        "description": "Streetlight flickering at night",
        "category": "infrastructure",
        "latitude": 37.77,
        "longitude": -122.41,
        "address": "123 Elm St",
        "media_urls": ["https://example.com/img1.jpg"],
    }
    res = await client.post(
        "/api/reports", json=payload, headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["title"] == "Broken Streetlight"
    assert data["category"] == "infrastructure"
    assert data["status"] == "submitted"
    assert data["user_id"] == user["id"]


async def test_create_report_unauthenticated_returns_401(client: AsyncClient):
    payload = {
        "title": "Broken Streetlight",
        "description": "Streetlight flickering at night",
        "category": "infrastructure",
    }
    res = await client.post("/api/reports", json=payload)
    assert res.status_code == 401


async def test_list_reports(client: AsyncClient):
    res = await client.get("/api/reports")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


async def test_get_report_by_id(client: AsyncClient):
    token, _ = await register_and_login(client, "rep_by_id@example.com")
    payload = {
        "title": "Water Main Leak",
        "description": "Flooding the street corner",
        "category": "utility",
    }
    create_res = await client.post(
        "/api/reports", json=payload, headers={"Authorization": f"Bearer {token}"}
    )
    rep_id = create_res.json()["id"]

    get_res = await client.get(f"/api/reports/{rep_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == "Water Main Leak"


async def test_get_report_not_found(client: AsyncClient):
    import uuid

    res = await client.get(f"/api/reports/{uuid.uuid4()}")
    assert res.status_code == 404


async def test_update_report(client: AsyncClient):
    token, _ = await register_and_login(client, "rep_update@example.com")
    create_res = await client.post(
        "/api/reports",
        json={"title": "Old Title", "description": "Desc", "category": "road"},
        headers={"Authorization": f"Bearer {token}"},
    )
    rep_id = create_res.json()["id"]

    patch_res = await client.patch(
        f"/api/reports/{rep_id}",
        json={"title": "New Title"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "New Title"


async def test_delete_report(client: AsyncClient):
    token, _ = await register_and_login(client, "rep_delete@example.com")
    create_res = await client.post(
        "/api/reports",
        json={"title": "To Delete", "description": "Desc", "category": "waste"},
        headers={"Authorization": f"Bearer {token}"},
    )
    rep_id = create_res.json()["id"]

    del_res = await client.delete(
        f"/api/reports/{rep_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert del_res.status_code == 204

    get_res = await client.get(f"/api/reports/{rep_id}")
    assert get_res.status_code == 404


async def test_location_bounds_validation(client: AsyncClient):
    token, _ = await register_and_login(client, "loc_val@example.com")
    # Invalid latitude > 90
    res = await client.post(
        "/api/reports",
        json={
            "title": "Invalid Loc",
            "description": "Desc",
            "category": "road",
            "latitude": 95.0,
            "longitude": 10.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422

    # Invalid longitude > 180
    res = await client.post(
        "/api/reports",
        json={
            "title": "Invalid Loc",
            "description": "Desc",
            "category": "road",
            "latitude": 10.0,
            "longitude": 190.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 422


async def test_non_owner_update_report_returns_403(client: AsyncClient):
    token1, _ = await register_and_login(client, "owner_test@example.com")
    token2, _ = await register_and_login(client, "attacker_test@example.com")

    create_res = await client.post(
        "/api/reports",
        json={"title": "Original Title", "description": "Original Desc", "category": "road"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    rep_id = create_res.json()["id"]

    patch_res = await client.patch(
        f"/api/reports/{rep_id}",
        json={"title": "Hacked Title"},
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert patch_res.status_code == 403


async def test_list_reports_filter_by_category(client: AsyncClient):
    token, _ = await register_and_login(client, "cat_filter@example.com")
    await client.post(
        "/api/reports",
        json={"title": "Road Issue", "description": "Desc", "category": "road"},
        headers={"Authorization": f"Bearer {token}"},
    )
    await client.post(
        "/api/reports",
        json={"title": "Waste Issue", "description": "Desc", "category": "waste"},
        headers={"Authorization": f"Bearer {token}"},
    )

    res = await client.get("/api/reports?category=road")
    assert res.status_code == 200
    items = res.json()
    assert len(items) >= 1
    assert all(i["category"] == "road" for i in items)
