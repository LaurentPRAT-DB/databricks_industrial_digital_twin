"""Lakebase (PostgreSQL) service for persistent storage.

Connects to Databricks Lakebase Autoscaling for what-if configs,
reports, and simulation tick storage.

Auth modes:
1. OAuth via Databricks SDK (Databricks Apps — production)
2. Direct credentials via LAKEBASE_USER/PASSWORD (local dev)
"""

import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from contextlib import contextmanager

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor, execute_values
    from psycopg2.pool import ThreadedConnectionPool
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False

logger = logging.getLogger(__name__)

_service_instance: Optional["LakebaseService"] = None
_service_lock = threading.Lock()


def get_lakebase_service() -> Optional["LakebaseService"]:
    global _service_instance
    if _service_instance is None:
        with _service_lock:
            if _service_instance is None:
                svc = LakebaseService()
                if svc.is_available:
                    _service_instance = svc
    return _service_instance


def _get_oauth_token(endpoint_name: str) -> Optional[tuple[str, str, Optional[Any]]]:
    try:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient()
        cred = w.postgres.generate_database_credential(endpoint=endpoint_name)
        me = w.current_user.me()
        logger.info("Lakebase OAuth: token acquired")
        return (cred.token, me.user_name, getattr(cred, "expire_time", None))
    except Exception as e:
        logger.warning(f"Lakebase OAuth failed: {e}")
        return None


class LakebaseService:

    def __init__(self):
        self._host = os.getenv("LAKEBASE_HOST")
        self._port = os.getenv("LAKEBASE_PORT", "5432")
        self._database = os.getenv("LAKEBASE_DATABASE", "databricks_postgres")
        self._schema = os.getenv("LAKEBASE_SCHEMA", "public")
        self._user = os.getenv("LAKEBASE_USER")
        self._password = os.getenv("LAKEBASE_PASSWORD")
        self._endpoint_name = os.getenv("LAKEBASE_ENDPOINT_NAME")
        self._use_oauth = os.getenv("LAKEBASE_USE_OAUTH", "false").lower() == "true"
        self._cached_credentials: Optional[tuple[str, str]] = None
        self._credential_expiry: Optional[datetime] = None
        self._pool: Optional["ThreadedConnectionPool"] = None
        self._pool_lock = threading.Lock()

    @property
    def is_available(self) -> bool:
        if not PSYCOPG2_AVAILABLE:
            return False
        if self._use_oauth and self._host and self._endpoint_name:
            return True
        return bool(self._host and self._user and self._password)

    def _get_credentials(self) -> Optional[tuple[str, str]]:
        if self._use_oauth and self._endpoint_name:
            now = datetime.now(timezone.utc)
            needs_refresh = (
                self._cached_credentials is None
                or self._credential_expiry is None
                or now >= self._credential_expiry - timedelta(minutes=5)
            )
            if needs_refresh:
                result = _get_oauth_token(self._endpoint_name)
                if result:
                    token, user, expire_time = result
                    self._cached_credentials = (token, user)
                    if expire_time and hasattr(expire_time, "seconds"):
                        self._credential_expiry = datetime.fromtimestamp(expire_time.seconds, tz=timezone.utc)
                    else:
                        self._credential_expiry = now + timedelta(minutes=45)
                else:
                    return None
            return self._cached_credentials
        if self._user and self._password:
            return (self._password, self._user)
        return None

    def _invalidate_pool(self):
        with self._pool_lock:
            if self._pool and not self._pool.closed:
                try:
                    self._pool.closeall()
                except Exception:
                    pass
            self._pool = None

    def _get_pool(self) -> Optional["ThreadedConnectionPool"]:
        with self._pool_lock:
            if self._pool is not None and not self._pool.closed:
                return self._pool
            creds = self._get_credentials()
            if not creds:
                return None
            password, user = creds
            try:
                self._pool = ThreadedConnectionPool(
                    minconn=2, maxconn=10,
                    host=self._host, port=self._port,
                    database=self._database, user=user, password=password,
                    sslmode="require",
                    options=f"-c search_path={self._schema}",
                    connect_timeout=10,
                )
                return self._pool
            except Exception as e:
                logger.warning(f"Lakebase pool creation failed: {e}")
                self._cached_credentials = None
                self._credential_expiry = None
                return None

    @contextmanager
    def _get_connection(self):
        pool = self._get_pool()
        if not pool:
            raise ConnectionError("Lakebase connection unavailable")
        conn = pool.getconn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

    def health_check(self) -> dict:
        if not self.is_available:
            return {"connected": False, "host": self._host}
        try:
            t0 = time.time()
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            latency_ms = round((time.time() - t0) * 1000, 1)
            return {"connected": True, "latency_ms": latency_ms, "host": self._host}
        except Exception as e:
            logger.warning(f"Lakebase health check failed: {e}")
            if "authentication" in str(e).lower() or "connection" in str(e).lower():
                self._cached_credentials = None
                self._credential_expiry = None
                self._invalidate_pool()
            return {"connected": False, "host": self._host, "error": str(e)[:100]}

    def ensure_tables(self):
        ddl = """
        CREATE TABLE IF NOT EXISTS scenarios (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            config_yaml TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS whatifs (
            id SERIAL PRIMARY KEY,
            scenario_id TEXT NOT NULL REFERENCES scenarios(id),
            slug TEXT NOT NULL,
            name TEXT NOT NULL,
            overrides JSONB NOT NULL DEFAULT '{}',
            saved_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(scenario_id, slug)
        );
        CREATE TABLE IF NOT EXISTS reports (
            id SERIAL PRIMARY KEY,
            scenario_id TEXT NOT NULL REFERENCES scenarios(id),
            slug TEXT NOT NULL,
            name TEXT NOT NULL,
            report JSONB NOT NULL,
            saved_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(scenario_id, slug)
        );
        CREATE TABLE IF NOT EXISTS simulation_ticks (
            id BIGSERIAL PRIMARY KEY,
            scenario_id TEXT NOT NULL,
            whatif_name TEXT,
            tick_index INT NOT NULL,
            sim_time TEXT NOT NULL,
            elapsed_s FLOAT NOT NULL,
            entities JSONB NOT NULL,
            resources JSONB NOT NULL,
            metrics JSONB NOT NULL,
            computed_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_ticks_scenario
            ON simulation_ticks(scenario_id, whatif_name, tick_index);
        """
        try:
            with self._get_connection() as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(ddl)
                conn.autocommit = False
            logger.info("Lakebase tables ensured")
        except Exception as e:
            logger.warning(f"Lakebase ensure_tables failed: {e}")

    # ------------------------------------------------------------------
    # Scenarios
    # ------------------------------------------------------------------

    def list_scenarios(self) -> list[dict]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT id, name, description FROM scenarios ORDER BY name")
                return [dict(r) for r in cur.fetchall()]

    def get_scenario_config(self, scenario_id: str) -> Optional[str]:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT config_yaml FROM scenarios WHERE id = %s", (scenario_id,))
                row = cur.fetchone()
                return row[0] if row else None

    # ------------------------------------------------------------------
    # What-Ifs
    # ------------------------------------------------------------------

    def save_whatif(self, scenario_id: str, slug: str, name: str, overrides: dict) -> bool:
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO whatifs (scenario_id, slug, name, overrides)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (scenario_id, slug) DO UPDATE
                            SET name = EXCLUDED.name, overrides = EXCLUDED.overrides, saved_at = NOW()
                    """, (scenario_id, slug, name, json.dumps(overrides)))
            return True
        except Exception as e:
            logger.warning(f"save_whatif failed: {e}")
            return False

    def list_whatifs(self, scenario_id: str) -> list[dict]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT slug, name, overrides, saved_at
                    FROM whatifs WHERE scenario_id = %s ORDER BY saved_at DESC
                """, (scenario_id,))
                rows = cur.fetchall()
                return [{
                    "name": r["name"],
                    "filename": f"{r['slug']}.json",
                    "saved_at": r["saved_at"].isoformat() if r["saved_at"] else None,
                    "overrides": r["overrides"],
                } for r in rows]

    def load_whatif(self, scenario_id: str, slug: str) -> Optional[dict]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT name, overrides, saved_at
                    FROM whatifs WHERE scenario_id = %s AND slug = %s
                """, (scenario_id, slug))
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "name": row["name"],
                    "scenario_id": scenario_id,
                    "overrides": row["overrides"],
                    "saved_at": row["saved_at"].isoformat() if row["saved_at"] else None,
                }

    # ------------------------------------------------------------------
    # Reports
    # ------------------------------------------------------------------

    def save_report(self, scenario_id: str, slug: str, name: str, report: dict, overwrite: bool = False) -> tuple[bool, Optional[str]]:
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    if not overwrite:
                        cur.execute("SELECT 1 FROM reports WHERE scenario_id = %s AND slug = %s", (scenario_id, slug))
                        if cur.fetchone():
                            return False, "already exists"
                    cur.execute("""
                        INSERT INTO reports (scenario_id, slug, name, report)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (scenario_id, slug) DO UPDATE
                            SET name = EXCLUDED.name, report = EXCLUDED.report, saved_at = NOW()
                    """, (scenario_id, slug, name, json.dumps(report)))
            return True, None
        except Exception as e:
            logger.warning(f"save_report failed: {e}")
            return False, str(e)

    def list_reports(self, scenario_id: str) -> list[dict]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT slug, name, saved_at, report->'run_count' as run_count
                    FROM reports WHERE scenario_id = %s ORDER BY saved_at DESC
                """, (scenario_id,))
                rows = cur.fetchall()
                return [{
                    "name": r["name"],
                    "filename": f"{r['slug']}.json",
                    "saved_at": r["saved_at"].isoformat() if r["saved_at"] else None,
                    "run_count": r["run_count"] or 0,
                } for r in rows]

    def load_report(self, scenario_id: str, slug: str) -> Optional[dict]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT name, report, saved_at
                    FROM reports WHERE scenario_id = %s AND slug = %s
                """, (scenario_id, slug))
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "name": row["name"],
                    "scenario_id": scenario_id,
                    "report": row["report"],
                    "saved_at": row["saved_at"].isoformat() if row["saved_at"] else None,
                }

    def check_report_exists(self, scenario_id: str, slug: str) -> bool:
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM reports WHERE scenario_id = %s AND slug = %s", (scenario_id, slug))
                return cur.fetchone() is not None

    # ------------------------------------------------------------------
    # Simulation Ticks
    # ------------------------------------------------------------------

    def save_simulation_ticks(self, scenario_id: str, whatif_name: Optional[str], frames: list[dict]) -> int:
        if not frames:
            return 0
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        DELETE FROM simulation_ticks
                        WHERE scenario_id = %s AND whatif_name IS NOT DISTINCT FROM %s
                    """, (scenario_id, whatif_name))
                    values = [
                        (scenario_id, whatif_name, i,
                         f["sim_time"], f["elapsed_s"],
                         json.dumps(f["entities"]),
                         json.dumps(f["resources"]),
                         json.dumps(f["metrics"]))
                        for i, f in enumerate(frames)
                    ]
                    execute_values(cur, """
                        INSERT INTO simulation_ticks
                            (scenario_id, whatif_name, tick_index, sim_time, elapsed_s, entities, resources, metrics)
                        VALUES %s
                    """, values, page_size=500)
            logger.info(f"Saved {len(frames)} ticks for {scenario_id}/{whatif_name}")
            return len(frames)
        except Exception as e:
            logger.warning(f"save_simulation_ticks failed: {e}")
            return 0

    def get_simulation_ticks(self, scenario_id: str, whatif_name: Optional[str] = None) -> list[dict]:
        with self._get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT tick_index, sim_time, elapsed_s, entities, resources, metrics
                    FROM simulation_ticks
                    WHERE scenario_id = %s AND whatif_name IS NOT DISTINCT FROM %s
                    ORDER BY tick_index
                """, (scenario_id, whatif_name))
                return [{
                    "sim_time": r["sim_time"],
                    "elapsed_s": r["elapsed_s"],
                    "entities": r["entities"],
                    "resources": r["resources"],
                    "metrics": r["metrics"],
                } for r in cur.fetchall()]
