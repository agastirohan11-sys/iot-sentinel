import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Every HTTP test gets its own database; never touch the user's SQLite data."""
    engine = create_engine('sqlite:///' + str(tmp_path / 'test.db'), connect_args={'check_same_thread': False})
    monkeypatch.setattr(main, 'engine', engine)
    monkeypatch.setattr(main, 'Session', sessionmaker(engine))
    monkeypatch.delenv('DEVICE_API_KEY', raising=False)
    previous = main.state.copy()
    main.state.update(running=False, mode='normal', last_error=None)
    try:
        with TestClient(main.app) as instance:
            yield instance
    finally:
        main.state.update(previous)
        engine.dispose()
