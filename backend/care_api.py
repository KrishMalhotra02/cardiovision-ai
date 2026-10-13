"""CardioVision care workspace: access-controlled research/demo patient longitudinal data.

NOT for live clinical use without formal clinician verification, security review,
privacy assessment and durable healthcare-grade storage. Self-contained SQLite MVP.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/care", tags=["Care workspace (research demo)"])
DB_PATH = Path(os.getenv("CARDIO_CARE_DB_PATH", str(Path(__file__).resolve().parent / "care_data" / "care.sqlite3")))
UPLOAD_DIR = Path(os.getenv("CARDIO_CARE_UPLOAD_DIR", str(DB_PATH.parent / "documents")))
TOKEN_SECONDS = 12 * 3600
MAX_UPLOAD_BYTES = 6 * 1024 * 1024
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('patient','doctor')), password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS share_invites (
 token_hash TEXT PRIMARY KEY, patient_id TEXT NOT NULL, expires_at INTEGER NOT NULL,
 redeemed_at TEXT);
CREATE TABLE IF NOT EXISTS care_links (
 patient_id TEXT NOT NULL, doctor_id TEXT NOT NULL, linked_at TEXT NOT NULL,
 revoked_at TEXT, PRIMARY KEY(patient_id,doctor_id));
CREATE TABLE IF NOT EXISTS assessments (
 id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, author_id TEXT NOT NULL,
 inputs_json TEXT NOT NULL, results_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, author_id TEXT NOT NULL,
 name TEXT NOT NULL, content_type TEXT NOT NULL, storage_name TEXT NOT NULL,
 bytes INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_plans (
 id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doctor_id TEXT NOT NULL,
 title TEXT NOT NULL, actions TEXT NOT NULL, follow_up TEXT NOT NULL,
 created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clinical_notes (
 id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doctor_id TEXT NOT NULL,
 note TEXT NOT NULL, visible_to_patient INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL,
 patient_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
"""


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA busy_timeout = 15000")
    con.executescript(SCHEMA)
    return con


def problem(status: int, detail: str):
    raise HTTPException(status_code=status, detail=detail)


def hash_password(password: str):
    salt = os.urandom(16)
    iterations = 450_000
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${key.hex()}"


def verify_password(password: str, stored: str):
    try:
        alg, count, salt, key = stored.split('$')
        if alg != 'pbkdf2_sha256':
            return False
        derived = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(count))
        return hmac.compare_digest(derived, bytes.fromhex(key))
    except Exception:
        return False


def digest(token: str):
    return hashlib.sha256(token.encode('utf8')).hexdigest()


def user_view(row):
    return {'id': row['id'], 'email': row['email'], 'display_name': row['display_name'], 'role': row['role']}


def token_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '):
        problem(401, 'Sign in to access your workspace')
    token = authorization[7:]
    if len(token) < 32:
        problem(401, 'Invalid session')
    with db() as con:
        user = con.execute('''SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
           WHERE s.token_hash=? AND s.expires_at > ?''', (digest(token), int(time.time()))).fetchone()
    if not user:
        problem(401, 'Session expired; sign in again')
    return user_view(user)


def require_role(user, role):
    if user['role'] != role:
        problem(403, f'{role.title()} access required')


def verify_access(con, user, patient_id):
    if user['role'] == 'patient':
        if user['id'] != patient_id:
            problem(403, 'You cannot access another patient’s records')
        return
    link = con.execute('''SELECT 1 FROM care_links WHERE patient_id=? AND doctor_id=?
      AND revoked_at IS NULL''', (patient_id, user['id'])).fetchone()
    if link is None:
        problem(403, 'Patient consent is required before accessing records')


def audit(con, actor_id, patient_id, action):
    con.execute('INSERT INTO audit(actor_id,patient_id,action,created_at) VALUES(?,?,?,?)',
                (actor_id,patient_id,action,utcnow()))


class Signup(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=2, max_length=80)
    role: str
    doctor_invite: str = ''


class Login(BaseModel):
    email: str
    password: str


@router.post('/signup', status_code=201)
def signup(body: Signup):
    email = body.email.strip().lower()
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        problem(422, 'Enter a valid email address')
    if body.role not in ('patient','doctor'):
        problem(422, 'Choose patient or doctor')
    if body.role == 'doctor':
        configured = os.getenv('CARDIO_DOCTOR_INVITE', '')
        if not configured:
            problem(503, 'Clinician registration is disabled until administrator approval is configured')
        if not hmac.compare_digest(configured, body.doctor_invite):
            problem(403, 'Valid clinician onboarding invitation required')
    uid = uuid4().hex
    try:
        with db() as con:
            con.execute('INSERT INTO users VALUES(?,?,?,?,?,?)',
                (uid,email,body.display_name.strip(),body.role,hash_password(body.password),utcnow()))
    except sqlite3.IntegrityError:
        problem(409, 'Account already exists')
    return {'message':'Account created. Sign in to continue.'}


@router.post('/login')
def login(body: Login):
    with db() as con:
        row = con.execute('SELECT * FROM users WHERE email=?', (body.email.strip().lower(),)).fetchone()
        if not row or not verify_password(body.password, row['password_hash']):
            problem(401, 'Invalid email or password')
        token = secrets.token_urlsafe(48)
        con.execute('INSERT INTO sessions VALUES(?,?,?)', (digest(token), row['id'], int(time.time())+TOKEN_SECONDS))
    return {'access_token': token, 'expires_in': TOKEN_SECONDS, 'user': user_view(row)}


@router.post('/logout')
def logout(user=Depends(token_user), authorization: str | None = Header(default=None)):
    with db() as con:
        con.execute('DELETE FROM sessions WHERE token_hash=?', (digest(authorization[7:]),))
    return {'ok': True}


@router.get('/me')
def me(user=Depends(token_user)):
    return {'user': user, 'mode': 'prototype; use synthetic or consented non-clinical test data only'}


@router.post('/share-invite')
def share_invite(user=Depends(token_user)):
    require_role(user, 'patient')
    invite = secrets.token_urlsafe(24)
    expiry = int(time.time()) + 30*60
    with db() as con:
        con.execute('INSERT INTO share_invites VALUES(?,?,?,NULL)', (digest(invite),user['id'],expiry))
        audit(con,user['id'],user['id'],'share_invite_created')
    return {'share_code':invite,'expires_in_minutes':30, 'message':'Share this once with your selected approved clinician only.'}


class Redeem(BaseModel):
    share_code: str = Field(min_length=20, max_length=120)


@router.post('/connect-patient')
def connect_patient(body: Redeem, user=Depends(token_user)):
    require_role(user, 'doctor')
    with db() as con:
        con.execute('BEGIN IMMEDIATE')
        invite = con.execute('''SELECT * FROM share_invites WHERE token_hash=? AND expires_at > ?
          AND redeemed_at IS NULL''', (digest(body.share_code.strip()), int(time.time()))).fetchone()
        if not invite:
            problem(400, 'Invalid, expired or already used share code')
        con.execute('UPDATE share_invites SET redeemed_at=? WHERE token_hash=?', (utcnow(),digest(body.share_code.strip())))
        con.execute('''INSERT INTO care_links(patient_id,doctor_id,linked_at,revoked_at) VALUES(?,?,?,NULL)
          ON CONFLICT(patient_id,doctor_id) DO UPDATE SET linked_at=excluded.linked_at,revoked_at=NULL''',
                    (invite['patient_id'],user['id'],utcnow()))
        audit(con,user['id'],invite['patient_id'],'patient_link_created')
    return {'ok':True}


@router.get('/links')
def my_links(user=Depends(token_user)):
    with db() as con:
        if user['role'] == 'patient':
            rows=con.execute('''SELECT d.id,d.display_name,d.email,c.linked_at FROM care_links c
              JOIN users d ON c.doctor_id=d.id WHERE c.patient_id=? AND c.revoked_at IS NULL
              ORDER BY c.linked_at DESC''',(user['id'],)).fetchall()
        else:
            rows=con.execute('''SELECT p.id,p.display_name,p.email,c.linked_at FROM care_links c
              JOIN users p ON c.patient_id=p.id WHERE c.doctor_id=? AND c.revoked_at IS NULL
              ORDER BY c.linked_at DESC''',(user['id'],)).fetchall()
    return {'links':[dict(row) for row in rows]}


@router.delete('/links/{other_id}')
def revoke_link(other_id: str, user=Depends(token_user)):
    require_role(user,'patient')
    with db() as con:
        updated=con.execute('''UPDATE care_links SET revoked_at=? WHERE patient_id=? AND doctor_id=?
           AND revoked_at IS NULL''',(utcnow(),user['id'],other_id)).rowcount
        if updated:
            audit(con,user['id'],user['id'],'patient_revoked_access')
    if not updated:
        problem(404,'Active clinician connection not found')
    return {'ok':True}


def serialize_records(con, patient_id, user):
    assessments=[{'id':r['id'],'created_at':r['created_at'],'author_id':r['author_id'],
                  'inputs':json.loads(r['inputs_json']),'results':json.loads(r['results_json'])}
                 for r in con.execute('SELECT * FROM assessments WHERE patient_id=? ORDER BY created_at DESC LIMIT 40',(patient_id,))]
    documents=[{'id':r['id'],'name':r['name'],'content_type':r['content_type'], 'bytes':r['bytes'],
                'created_at':r['created_at']} for r in con.execute('SELECT * FROM documents WHERE patient_id=? ORDER BY created_at DESC LIMIT 100',(patient_id,))]
    plans=[dict(r) for r in con.execute('SELECT * FROM care_plans WHERE patient_id=? ORDER BY created_at DESC LIMIT 100',(patient_id,))]
    notes=[dict(r) for r in con.execute('''SELECT * FROM clinical_notes WHERE patient_id=?
       AND (?='doctor' OR visible_to_patient=1) ORDER BY created_at DESC LIMIT 100''',(patient_id,user['role']))]
    doctors=[dict(r) for r in con.execute('''SELECT u.id,u.display_name FROM care_links c JOIN users u ON u.id=c.doctor_id
       WHERE c.patient_id=? AND c.revoked_at IS NULL''',(patient_id,))]
    return {'assessments':assessments,'documents':documents,'plans':plans,'notes':notes,'clinicians':doctors}


@router.get('/patients/{patient_id}/overview')
def overview(patient_id: str, user=Depends(token_user)):
    with db() as con:
        verify_access(con,user,patient_id)
        patient=con.execute("SELECT id,display_name,email FROM users WHERE id=? AND role='patient'",(patient_id,)).fetchone()
        if not patient:
            problem(404,'Patient record not found')
        output={'patient':dict(patient), **serialize_records(con,patient_id,user)}
        audit(con,user['id'],patient_id,'record_viewed')
    return output


@router.get('/my-overview')
def my_overview(user=Depends(token_user)):
    require_role(user,'patient')
    return overview(user['id'],user)


class SaveAssessment(BaseModel):
    patient_id: str
    inputs: dict[str,Any]
    results: dict[str,Any]


@router.post('/assessments', status_code=201)
def save_assessment(body: SaveAssessment, user=Depends(token_user)):
    # API only stores results; predictions must originate from normal /api/quick/predict endpoint.
    # This MVP does not authenticate model output integrity; production must generate inference server-side.
    scores=body.results.get('predictions')
    if not isinstance(scores,dict) or any(not isinstance(scores.get(k),dict) or
        not isinstance(scores[k].get('positive_probability'),(int,float)) or
        not (0 <= scores[k]['positive_probability'] <= 1) for k in ('CAD','LAD','LCX','RCA')):
        problem(422,'Four valid model predictions required')
    if len(json.dumps(body.results)) > 100_000 or len(json.dumps(body.inputs)) > 10_000:
        problem(413,'Assessment payload exceeds size limit')
    record_id=uuid4().hex
    with db() as con:
        verify_access(con,user,body.patient_id)
        con.execute('INSERT INTO assessments VALUES(?,?,?,?,?,?)',
           (record_id,body.patient_id,user['id'],json.dumps(body.inputs),json.dumps(body.results),utcnow()))
        audit(con,user['id'],body.patient_id,'assessment_saved')
    return {'id':record_id}


class CreatePlan(BaseModel):
    patient_id: str
    title: str = Field(min_length=3,max_length=120)
    actions: str = Field(min_length=5,max_length=3500)
    follow_up: str = Field(default='',max_length=120)


@router.post('/plans', status_code=201)
def create_plan(body: CreatePlan, user=Depends(token_user)):
    require_role(user,'doctor')
    with db() as con:
        verify_access(con,user,body.patient_id)
        identifier=uuid4().hex
        con.execute('INSERT INTO care_plans VALUES(?,?,?,?,?,?,?)',
                    (identifier,body.patient_id,user['id'],body.title.strip(),body.actions.strip(),body.follow_up.strip(),utcnow()))
        audit(con,user['id'],body.patient_id,'care_plan_authored')
    return {'id':identifier,'message':'Clinician-authored action plan published to the linked patient'}


class CreateNote(BaseModel):
    patient_id: str
    note: str = Field(min_length=3,max_length=3000)
    visible_to_patient: bool = True


@router.post('/notes', status_code=201)
def create_note(body: CreateNote, user=Depends(token_user)):
    require_role(user,'doctor')
    with db() as con:
        verify_access(con,user,body.patient_id)
        identifier=uuid4().hex
        con.execute('INSERT INTO clinical_notes VALUES(?,?,?,?,?,?)',
                    (identifier,body.patient_id,user['id'],body.note.strip(),int(body.visible_to_patient),utcnow()))
        audit(con,user['id'],body.patient_id,'clinical_note_added')
    return {'id':identifier}


CONTENT_TYPES={'.pdf':'application/pdf','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'}


@router.post('/patients/{patient_id}/documents', status_code=201)
async def upload_document(patient_id: str, request: Request, name: str = Query(max_length=120), user=Depends(token_user)):
    suffix=Path(name).suffix.lower()
    if suffix not in CONTENT_TYPES or '/' in name or '\\' in name:
        problem(422,'Supported report files: PDF, PNG or JPEG only')
    expected=CONTENT_TYPES[suffix]
    length=request.headers.get('content-length')
    if length and int(length)>MAX_UPLOAD_BYTES:
        problem(413,'File exceeds 6 MB')
    body=await request.body()
    if not body or len(body)>MAX_UPLOAD_BYTES:
        problem(413,'Document missing or larger than 6 MB')
    if suffix=='.pdf' and not body.startswith(b'%PDF-'):
        problem(422,'File content does not match PDF')
    if suffix=='.png' and not body.startswith(b'\x89PNG\r\n\x1a\n'):
        problem(422,'File content does not match PNG')
    if suffix in ('.jpg','.jpeg') and not body.startswith(b'\xff\xd8\xff'):
        problem(422,'File content does not match JPEG')
    identifier=uuid4().hex
    storage_name=uuid4().hex+suffix
    with db() as con:
        verify_access(con,user,patient_id)
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        path=UPLOAD_DIR/storage_name
        with path.open('xb') as f:
            f.write(body)
        os.chmod(path,0o600)
        con.execute('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?)',
                    (identifier,patient_id,user['id'],name,expected,storage_name,len(body),utcnow()))
        audit(con,user['id'],patient_id,'document_uploaded')
    return {'id':identifier,'name':name}


@router.get('/documents/{document_id}/download')
def download_document(document_id: str, user=Depends(token_user)):
    with db() as con:
        doc=con.execute('SELECT * FROM documents WHERE id=?',(document_id,)).fetchone()
        if not doc:
            problem(404,'Document not found')
        verify_access(con,user,doc['patient_id'])
        path=UPLOAD_DIR/doc['storage_name']
        if not path.exists():
            problem(410,'File unavailable on this deployment. Configure persistent file storage.')
        audit(con,user['id'],doc['patient_id'],'document_downloaded')
        body=path.read_bytes()
    return Response(content=body,media_type=doc['content_type'],headers={
        'Content-Disposition': f"attachment; filename*=UTF-8''{_quote(doc['name'])}",
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
    })


def _quote(name):
    from urllib.parse import quote
    return quote(name,safe='')


@router.get('/health')
def care_health():
    return {'status':'ok','auth':'session bearer','records':'local SQLite MVP',
            'persistence':'requires persistent service/disk for deployment'}
