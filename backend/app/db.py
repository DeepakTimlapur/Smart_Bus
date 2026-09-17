import os
import json
import logging
from typing import Optional, Any
from pymongo import MongoClient, ASCENDING
import pymongo.errors
from backend.app.config import MONGODB_URI, MONGODB_DB

logger = logging.getLogger("smart_bus.db")

_client: Optional[Any] = None
_db: Optional[Any] = None
_is_mock: bool = False
_STORAGE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "backend_data.json")


def _load_persisted_mock_data(mock_db: Any):
    """Loads saved JSON mock data into mongomock collections if file exists."""
    if not os.path.exists(_STORAGE_FILE):
        return
    try:
        with open(_STORAGE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            for collection_name, docs in data.items():
                if docs and isinstance(docs, list):
                    coll = mock_db[collection_name]
                    if coll.count_documents({}) == 0:
                        coll.insert_many(docs)
        logger.info("Loaded persisted state into in-memory MongoDB store from backend_data.json")
    except Exception as e:
        logger.warning(f"Could not restore mock database from {_STORAGE_FILE}: {e}")


def persist_mock_data():
    """Saves mongomock collections to disk so data is never lost across server restarts."""
    global _db, _is_mock
    if not _is_mock or _db is None:
        return
    try:
        state = {}
        collections = ["users", "students", "drivers", "buses", "gps_locations", "fees", "attendance", "email_logs", "gps_logs"]
        for coll_name in collections:
            docs = list(_db[coll_name].find({}, {"_id": 0}))
            state[coll_name] = docs
        with open(_STORAGE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, default=str)
    except Exception as e:
        logger.warning(f"Could not persist mock database to {_STORAGE_FILE}: {e}")


async def init_db() -> Any:
    """
    Initializes connection to MongoDB.
    First attempts connection to live MongoDB cluster/daemon specified in MONGODB_URI.
    If external MongoDB is unavailable, gracefully falls back to persistent mongomock.
    Creates necessary collection indexes.
    """
    global _client, _db, _is_mock

    if _db is not None:
        return _db

    # Try connecting to live MongoDB
    try:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=1500)
        # Test connection ping
        client.admin.command("ping")
        _client = client
        _db = _client[MONGODB_DB]
        _is_mock = False
        logger.info(f"Connected successfully to live MongoDB at {MONGODB_URI} (DB: {MONGODB_DB})")
    except (pymongo.errors.ConnectionFailure, pymongo.errors.ServerSelectionTimeoutError, Exception) as err:
        logger.warning(
            f"Live MongoDB not reachable at {MONGODB_URI} ({err}). "
            "Falling back to local persistent Mongo engine."
        )
        try:
            import mongomock
            _client = mongomock.MongoClient()
            _db = _client[MONGODB_DB]
            _is_mock = True
            _load_persisted_mock_data(_db)
            logger.info(f"Initialized local Mongo engine with database '{MONGODB_DB}'.")
        except Exception as mock_err:
            logger.error(f"Fatal: Failed to initialize database: {mock_err}")
            raise RuntimeError(f"Database initialization failed: {mock_err}")

    # Create indexes on required collections
    try:
        _db.users.create_index([("username", ASCENDING)], unique=True)
        _db.users.create_index([("email", ASCENDING)])
        _db.students.create_index([("student_id", ASCENDING)], unique=True)
        _db.students.create_index([("email", ASCENDING)])
        _db.buses.create_index([("bus_id", ASCENDING)], unique=True)
        _db.drivers.create_index([("username", ASCENDING)], unique=True)
        _db.fees.create_index([("student_id", ASCENDING)])
        _db.gps_locations.create_index([("bus_id", ASCENDING)])
        _db.email_logs.create_index([("student_id", ASCENDING)])
        _db.email_logs.create_index([("created_at", ASCENDING)])
    except Exception as idx_err:
        logger.warning(f"Index creation warning: {idx_err}")

    return _db


async def close_db() -> None:
    """Closes connection to MongoDB gracefully."""
    global _client, _db
    if _is_mock:
        persist_mock_data()
    if _client is not None:
        try:
            _client.close()
            logger.info("Closed MongoDB database connection.")
        except Exception as e:
            logger.warning(f"Error during MongoDB close: {e}")
        finally:
            _client = None
            _db = None


def get_db() -> Any:
    """Dependency / accessor returning the active MongoDB database."""
    global _db
    if _db is None:
        # Synchronous fallback initialization
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We can initialize synchronously
                pass
        except Exception:
            pass
        # Direct sync fallback
        global _client, _is_mock
        try:
            client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=1200)
            client.admin.command("ping")
            _client = client
            _db = _client[MONGODB_DB]
            _is_mock = False
        except Exception:
            import mongomock
            _client = mongomock.MongoClient()
            _db = _client[MONGODB_DB]
            _is_mock = True
            _load_persisted_mock_data(_db)
    return _db


def get_client() -> Optional[Any]:
    """Returns the MongoClient instance."""
    return _client


def is_mock_db() -> bool:
    """Returns whether database is running in mock/local fallback mode."""
    return _is_mock
