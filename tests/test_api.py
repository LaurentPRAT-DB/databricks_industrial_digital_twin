"""Tests for the FastAPI backend endpoints."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.backend.main import app, CONFIGS_DIR, WHATIF_DIR, REPORTS_DIR


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def scenario_id():
    return "assembly_line_3station"


class TestScenarios:
    def test_list_scenarios(self, client):
        res = client.get("/api/scenarios")
        assert res.status_code == 200
        data = res.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert all("id" in s and "name" in s for s in data)

    def test_load_scenario(self, client, scenario_id):
        res = client.post("/api/scenarios/load", json={"id": scenario_id})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "loaded"
        assert data["id"] == scenario_id
        assert data["frame_count"] > 0
        assert "whatif_count" in data

    def test_load_scenario_not_found(self, client):
        res = client.post("/api/scenarios/load", json={"id": "nonexistent_xyz"})
        assert res.status_code == 404

    def test_get_scenario_parameters(self, client, scenario_id):
        res = client.get(f"/api/scenarios/{scenario_id}/parameters")
        assert res.status_code == 200
        data = res.json()
        assert data["scenario_id"] == scenario_id
        assert "locations" in data
        assert len(data["locations"]) > 0
        loc = data["locations"][0]
        assert "id" in loc
        assert "deviations" in loc

    def test_get_scenario_parameters_not_found(self, client):
        res = client.get("/api/scenarios/nonexistent_xyz/parameters")
        assert res.status_code == 404


class TestSimulation:
    def test_get_frames(self, client):
        res = client.get("/api/simulation/frames")
        assert res.status_code == 200
        data = res.json()
        assert "frames" in data
        assert "frame_count" in data
        assert data["frame_count"] > 0
        assert "config" in data
        assert "paths" in data
        assert "locations" in data

    def test_simulate_with_overrides(self, client, scenario_id):
        res = client.post("/api/scenarios/simulate", json={
            "id": scenario_id,
            "name": "Test What-If",
            "overrides": {},
        })
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "computed"
        assert data["name"] == "Test What-If"

    def test_simulate_not_found(self, client):
        res = client.post("/api/scenarios/simulate", json={
            "id": "nonexistent_xyz",
            "name": "Test",
        })
        assert res.status_code == 404

    def test_status(self, client):
        res = client.get("/api/status")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ready"
        assert "frame_count" in data


class TestWhatIf:
    def test_save_and_list_and_load(self, client, scenario_id, tmp_path):
        with patch("app.backend.main.WHATIF_DIR", tmp_path / "whatif"):
            res = client.post("/api/whatif/save", json={
                "scenario_id": scenario_id,
                "name": "Test What-If Save",
                "overrides": {"cnc_mill_2": {"cycle_time_factor": 1.5}},
            })
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "saved"
            filename = data["filename"]

            res = client.get(f"/api/whatif/list/{scenario_id}")
            assert res.status_code == 200
            items = res.json()["items"]
            assert len(items) == 1
            assert items[0]["name"] == "Test What-If Save"

            res = client.get(f"/api/whatif/load/{scenario_id}/{filename}")
            assert res.status_code == 200
            loaded = res.json()
            assert loaded["name"] == "Test What-If Save"
            assert loaded["overrides"]["cnc_mill_2"]["cycle_time_factor"] == 1.5

    def test_save_empty_name(self, client, scenario_id):
        res = client.post("/api/whatif/save", json={
            "scenario_id": scenario_id,
            "name": "",
            "overrides": {},
        })
        assert res.status_code == 400

    def test_list_empty(self, client, tmp_path):
        with patch("app.backend.main.WHATIF_DIR", tmp_path / "whatif"):
            res = client.get("/api/whatif/list/nonexistent_scenario")
            assert res.status_code == 200
            assert res.json()["items"] == []

    def test_load_not_found(self, client, scenario_id):
        res = client.get(f"/api/whatif/load/{scenario_id}/nonexistent.json")
        assert res.status_code == 404


class TestReports:
    def test_run_report(self, client, scenario_id):
        res = client.post(f"/api/scenarios/{scenario_id}/run-report", json=None)
        assert res.status_code == 200
        data = res.json()
        assert data["scenario_id"] == scenario_id
        assert "baseline" in data
        assert data["baseline"]["metrics"]["throughput_per_hour"] >= 0
        assert "whatifs" in data
        assert data["run_count"] >= 1

    def test_run_report_not_found(self, client):
        res = client.post("/api/scenarios/nonexistent_xyz/run-report", json=None)
        assert res.status_code == 404

    def test_save_list_load_report(self, client, scenario_id, tmp_path):
        with patch("app.backend.main.REPORTS_DIR", tmp_path / "reports"):
            report_data = {
                "baseline": {"name": "Baseline", "metrics": {"throughput_per_hour": 20}},
                "whatifs": [],
                "run_count": 1,
                "elapsed_s": 0.5,
            }

            # Save
            res = client.post("/api/reports/save", json={
                "scenario_id": scenario_id,
                "name": "Test Report",
                "report": report_data,
                "overwrite": False,
            })
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "saved"
            filename = data["filename"]

            # List
            res = client.get(f"/api/reports/list/{scenario_id}")
            assert res.status_code == 200
            items = res.json()["items"]
            assert len(items) == 1
            assert items[0]["name"] == "Test Report"
            assert items[0]["run_count"] == 1

            # Load
            res = client.get(f"/api/reports/load/{scenario_id}/{filename}")
            assert res.status_code == 200
            loaded = res.json()
            assert loaded["name"] == "Test Report"
            assert loaded["report"]["run_count"] == 1

    def test_save_report_duplicate_blocked(self, client, scenario_id, tmp_path):
        with patch("app.backend.main.REPORTS_DIR", tmp_path / "reports"):
            body = {
                "scenario_id": scenario_id,
                "name": "Dup Report",
                "report": {"baseline": {}, "whatifs": [], "run_count": 1, "elapsed_s": 0.1},
                "overwrite": False,
            }
            client.post("/api/reports/save", json=body)
            res = client.post("/api/reports/save", json=body)
            assert res.status_code == 409
            assert "already exists" in res.json()["error"]

    def test_save_report_overwrite(self, client, scenario_id, tmp_path):
        with patch("app.backend.main.REPORTS_DIR", tmp_path / "reports"):
            body = {
                "scenario_id": scenario_id,
                "name": "Overwrite Report",
                "report": {"baseline": {}, "whatifs": [], "run_count": 1, "elapsed_s": 0.1},
                "overwrite": False,
            }
            client.post("/api/reports/save", json=body)
            body["overwrite"] = True
            res = client.post("/api/reports/save", json=body)
            assert res.status_code == 200

    def test_save_report_empty_name(self, client, scenario_id):
        res = client.post("/api/reports/save", json={
            "scenario_id": scenario_id,
            "name": "",
            "report": {},
        })
        assert res.status_code == 400

    def test_check_report_exists(self, client, scenario_id, tmp_path):
        with patch("app.backend.main.REPORTS_DIR", tmp_path / "reports"):
            res = client.get(f"/api/reports/check/{scenario_id}/nonexistent")
            assert res.status_code == 200
            assert res.json()["exists"] is False

    def test_list_reports_empty(self, client, tmp_path):
        with patch("app.backend.main.REPORTS_DIR", tmp_path / "reports"):
            res = client.get("/api/reports/list/nonexistent_scenario")
            assert res.status_code == 200
            assert res.json()["items"] == []

    def test_load_report_not_found(self, client, scenario_id):
        res = client.get(f"/api/reports/load/{scenario_id}/nonexistent.json")
        assert res.status_code == 404


class TestGenerateScenario:
    def test_generate_scenario(self, client, tmp_path):
        with patch("app.backend.main.CONFIGS_DIR", tmp_path):
            # Need a valid config for precompute, so copy existing
            import shutil
            src = CONFIGS_DIR / "assembly_line_3station.yaml"
            shutil.copy(src, tmp_path / "assembly_line_3station.yaml")

            res = client.post("/api/scenarios/generate", json={
                "name": "Test Generated",
                "stations": [
                    {"name": "Station A", "cycle_mean": 60},
                    {"name": "Station B", "cycle_mean": 90},
                ],
                "duration_hours": 1.0,
                "spawn_rate_per_hour": 10,
            })
            assert res.status_code == 200
            data = res.json()
            assert data["status"] == "generated"
            assert data["frame_count"] > 0

    def test_generate_no_stations(self, client):
        res = client.post("/api/scenarios/generate", json={
            "name": "Empty",
            "stations": [],
        })
        assert res.status_code == 400
