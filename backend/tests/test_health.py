import pytest
from unittest.mock import AsyncMock, patch
from httpx import ASGITransport, AsyncClient
from fastapi.testclient import TestClient

from app.main import app


def test_health_test_client():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "databases" in data
        assert "app_db" in data["databases"]
        assert "target_db" in data["databases"]
        assert isinstance(data["databases"]["app_db"], bool)
        assert isinstance(data["databases"]["target_db"], bool)


@pytest.mark.asyncio
async def test_health_async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "databases" in data
        assert isinstance(data["databases"]["app_db"], bool)
        assert isinstance(data["databases"]["target_db"], bool)


@pytest.mark.asyncio
async def test_health_with_databases_connected():
    with patch("app.main.ping_databases", new_callable=AsyncMock) as mock_ping:
        mock_ping.return_value = {"app_db": True, "target_db": True}
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get("/api/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
            assert data["databases"] == {"app_db": True, "target_db": True}


@pytest.mark.asyncio
async def test_health_with_databases_disconnected():
    with patch("app.main.ping_databases", new_callable=AsyncMock) as mock_ping:
        mock_ping.return_value = {"app_db": False, "target_db": False}
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            response = await ac.get("/api/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
            assert data["databases"] == {"app_db": False, "target_db": False}
