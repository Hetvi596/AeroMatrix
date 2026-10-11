"""Bounded, expiring SQLite sessions protected with independent bearer tokens."""
import hashlib
import hmac
import json
import secrets
import sqlite3
import time
from fastapi import HTTPException

class Conversations:
    def __init__(self, settings):
        self.s = settings
        settings.state_dir.mkdir(parents=True, exist_ok=True)
        self.path = settings.state_dir / 'conversations.sqlite3'
        with self.db() as db:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, updated REAL NOT NULL, state TEXT NOT NULL, history TEXT NOT NULL)')

    def db(self): return sqlite3.connect(self.path, timeout=10)

    def load(self, sid, token):
        now = time.time()
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE updated < ?', (now-self.s.retention_hours*3600,))
            row = db.execute('SELECT token_hash,state,history FROM sessions WHERE id=?', (sid,)).fetchone() if sid else None
            if row:
                if not token or not hmac.compare_digest(row[0], hashlib.sha256(token.encode()).hexdigest()):
                    raise HTTPException(403, 'Invalid session credentials')
                return sid, token, json.loads(row[1]), json.loads(row[2])
            if token: raise HTTPException(404, 'Session expired or missing; start a new session')
            if db.execute('SELECT count(*) FROM sessions').fetchone()[0] >= self.s.max_sessions:
                raise HTTPException(503, 'Session capacity reached')
            sid = sid or secrets.token_urlsafe(18)
            token = secrets.token_urlsafe(32)
            db.execute('INSERT INTO sessions VALUES (?,?,?,?,?)', (sid,hashlib.sha256(token.encode()).hexdigest(),now,'{}','[]'))
            return sid,token,{},[]

    def save(self, sid, state, history):
        with self.db() as db:
            db.execute('UPDATE sessions SET updated=?,state=?,history=? WHERE id=?', (time.time(),json.dumps(state,ensure_ascii=False),json.dumps(history[-2*self.s.history_turns:],ensure_ascii=False),sid))

    def reset(self, sid, token):
        # Never create a session as a side effect of reset.
        with self.db() as db:
            row=db.execute('SELECT token_hash FROM sessions WHERE id=?',(sid,)).fetchone()
            if not row or not token or not hmac.compare_digest(row[0],hashlib.sha256(token.encode()).hexdigest()):
                raise HTTPException(403,'Invalid session credentials')
            db.execute('DELETE FROM sessions WHERE id=?',(sid,))
