"""Application entry point for Databricks App deployment.

Uses python startup.py instead of uvicorn CLI to ensure proper error
handling and process lifecycle for the Databricks App health checker.
"""
import sys
import os
import traceback
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s - %(message)s")
logger = logging.getLogger("startup")

logger.info("Python %s | CWD: %s", sys.version.split()[0], os.getcwd())
logger.info("LAKEBASE_HOST=%s SIM_CONFIGS_DIR=%s",
            os.getenv("LAKEBASE_HOST", "NOT SET"),
            os.getenv("SIM_CONFIGS_DIR", "NOT SET"))

try:
    from app.backend.main import app
    import uvicorn
    logger.info("Starting uvicorn...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
except Exception as e:
    logger.fatal("Application failed to start: %s", e)
    traceback.print_exc()
    import time
    time.sleep(30)
    sys.exit(1)
