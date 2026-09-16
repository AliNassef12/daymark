"""Private HTTPS bridge + durable Gmail reminder queue. Run one service instance."""
from contextlib import contextmanager
import hmac
import logging
import os
import re
import smtplib
import sqlite3
import ssl
import threading
import time
from email.message import EmailMessage
from pathlib import Path
from flask import Flask, request, jsonify
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger('daymark.reminders')
SENDER = 'alinassef1220@gmail.com'
LOCK = threading.RLock()

@contextmanager
def connect():
    path = Path(os.environ.get('REMINDER_DB', 'data/reminders.sqlite3'))
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=35)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()

def initialize():
    with connect() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS owners(owner TEXT PRIMARY KEY, revision INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(owner TEXT NOT NULL,id TEXT NOT NULL,email TEXT NOT NULL,
          title TEXT NOT NULL,deadline INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,
          next_attempt INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(owner,id));
        CREATE INDEX IF NOT EXISTS jobs_due ON jobs(sent,deadline,next_attempt);
        ''')

def create_app():
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
    initialize()

    @app.get('/health')
    def health():
        return jsonify(ok=True)

    @app.post('/sync')
    def sync():
        token = os.environ.get('REMINDER_BRIDGE_TOKEN', '')
        if len(token) < 32 or not hmac.compare_digest(request.headers.get('Authorization', ''), 'Bearer ' + token):
            return jsonify(error='Unauthorized'), 401
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify(error='Invalid JSON'), 400
        owner, email, revision, items = (data.get(k) for k in ('owner', 'email', 'revision', 'items'))
        if not isinstance(owner, str) or not 1 <= len(owner) <= 250 or not isinstance(email, str) or not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+', email) or len(email)>254:
            return jsonify(error='Invalid owner or email'), 400
        if type(revision) is not int or revision < 0 or not isinstance(items, list) or len(items)>10000:
            return jsonify(error='Invalid snapshot'), 400
        seen = set()
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get('id'), str) or not 1 <= len(item['id']) <= 200 or item['id'] in seen or not isinstance(item.get('title'), str) or not 1 <= len(item['title']) <= 160 or type(item.get('deadline')) is not int or not 0 < item['deadline'] <= 8640000000000000:
                return jsonify(error='Invalid item'), 400
            seen.add(item['id'])
        with LOCK, connect() as con:
            old = con.execute('SELECT revision FROM owners WHERE owner=?', (owner,)).fetchone()
            if old and old['revision'] >= revision:
                return jsonify(ok=True, stale=True)
            old_jobs = {r['id']: dict(r) for r in con.execute('SELECT * FROM jobs WHERE owner=?', (owner,))}
            con.execute('DELETE FROM jobs WHERE owner=?', (owner,))
            for item in items:
                previous = old_jobs.get(item['id'])
                same = previous and previous['deadline'] == item['deadline']
                con.execute('INSERT INTO jobs(owner,id,email,title,deadline,sent,next_attempt,attempts) VALUES(?,?,?,?,?,?,?,?)',
                    (owner,item['id'],email,item['title'],item['deadline'],previous['sent'] if same else 0,previous['next_attempt'] if same else 0,previous['attempts'] if same else 0))
            con.execute('INSERT INTO owners(owner,revision) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision', (owner,revision))
        return jsonify(ok=True)
    return app

def send_warning(job):
    password = os.environ.get('GMAIL_APP_PASSWORD', '').replace(' ', '')
    if not password:
        raise RuntimeError('GMAIL_APP_PASSWORD is not configured')
    message = EmailMessage()
    message['From'] = SENDER
    message['To'] = job['email']
    message['Subject'] = 'Daymark: your deadline is approaching'
    message['Message-ID'] = '<' + __import__('hashlib').sha256(f"{job['owner']}:{job['id']}:{job['deadline']}".encode()).hexdigest() + '@daymark.local>'
    due = __import__('datetime').datetime.fromtimestamp(job['deadline']/1000, __import__('datetime').timezone.utc).strftime('%d %b %Y, %H:%M UTC')
    message.set_content(f"Your {job['id'].split(':')[0]} is due within two hours.\n\n{job['title']}\nDeadline: {due}\n\nOpen Daymark to review your plans.\n")
    with smtplib.SMTP('smtp.gmail.com', 587, timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(SENDER, password)
        smtp.send_message(message)

def process_due(now=None, send=send_warning):
    now = int(time.time()*1000) if now is None else now
    sent = 0
    # One instance and a transaction/lock keep /sync cancellation ordered with sends.
    with LOCK, connect() as con:
        jobs = con.execute('SELECT * FROM jobs WHERE sent=0 AND deadline>? AND deadline<=? AND next_attempt<=? ORDER BY deadline LIMIT 100', (now,now+7200000,now)).fetchall()
        for job in jobs:
            try:
                send(job)
                con.execute('UPDATE jobs SET sent=1 WHERE owner=? AND id=? AND deadline=?', (job['owner'],job['id'],job['deadline']))
                con.commit()
                sent += 1
            except Exception:
                log.exception('Reminder delivery failed; will retry')
                delay = min(300000, 30000 * 2 ** min(job['attempts'],4))
                con.execute('UPDATE jobs SET attempts=attempts+1,next_attempt=? WHERE owner=? AND id=?', (now+delay,job['owner'],job['id']))
                con.commit()
    return sent

def loop():
    while True:
        try:
            process_due()
        except Exception:
            log.exception('Reminder scheduler error')
        time.sleep(30)

if __name__ == '__main__':
    from waitress import serve
    logging.basicConfig(level=logging.INFO)
    if len(os.environ.get('REMINDER_BRIDGE_TOKEN','')) < 32 or not os.environ.get('GMAIL_APP_PASSWORD'):
        raise SystemExit('Set a random REMINDER_BRIDGE_TOKEN (32+ characters) and GMAIL_APP_PASSWORD in your private environment first.')
    app = create_app()
    threading.Thread(target=loop, daemon=True).start()
    serve(app, host=os.environ.get('HOST','127.0.0.1'), port=int(os.environ.get('PORT','8080')))
