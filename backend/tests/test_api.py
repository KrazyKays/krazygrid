from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_new_game_with_seed_returns_camel_case_state():
    response = client.post("/api/game/new", json={"seed": 42})
    assert response.status_code == 200
    body = response.json()
    assert body["maxTurns"] == 10
    assert body["turnsLeft"] == 10
    assert body["rng"] == 1256095082
    assert "max_turns" not in body


def test_cast_flow_returns_state_and_report():
    state = client.post("/api/game/new", json={"seed": 42}).json()
    response = client.post(
        "/api/game/cast",
        json={"state": state, "shape": "line", "x": 2, "y": 0},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["state"]["turnsLeft"] == state["turnsLeft"] - 1
    assert body["report"]["treasuresGained"] == 2
    assert body["report"]["moneyGained"] == 20
    assert len(body["report"]["cells"]) == 3


def test_cast_out_of_bounds_returns_409():
    state = client.post("/api/game/new", json={}).json()
    response = client.post(
        "/api/game/cast",
        json={"state": state, "shape": "cross", "x": 99, "y": 0},
    )
    assert response.status_code == 409


def test_invalid_shape_returns_422():
    state = client.post("/api/game/new", json={}).json()
    response = client.post(
        "/api/game/cast",
        json={"state": state, "shape": "triangle", "x": 0, "y": 0},
    )
    assert response.status_code == 422
