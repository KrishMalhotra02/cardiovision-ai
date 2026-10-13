"""Isolated demo care access tests; use synthetic data only."""
import importlib.util
import os
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient


def client(tmp_path, monkeypatch):
    monkeypatch.setenv('CARDIO_CARE_DB_PATH', str(tmp_path / 'demo.sqlite3'))
    monkeypatch.setenv('CARDIO_CARE_UPLOAD_DIR', str(tmp_path / 'demo_files'))
    monkeypatch.setenv('CARDIO_DOCTOR_INVITE','synthetic-clinician-test-secret')
    module_path = Path(__file__).resolve().parents[1] / 'backend' / 'care_api.py'
    spec = importlib.util.spec_from_file_location('isolated_care_api', module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name]=module
    spec.loader.exec_module(module)
    app=FastAPI()
    app.include_router(module.router)
    return TestClient(app)


def create(c, email, role, invite=''):
    r=c.post('/api/care/signup',json={'email':email,'password':'FakeLongPassword!2026','role':role,'display_name':role.title()+' Test','doctor_invite':invite})
    assert r.status_code==201, r.text
    response=c.post('/api/care/login',json={'email':email,'password':'FakeLongPassword!2026'})
    assert response.status_code==200
    obj=response.json()
    return obj['user']['id'],{'Authorization':'Bearer '+obj['access_token']}


def test_consent_assessment_docs_and_revoke(tmp_path,monkeypatch):
    c=client(tmp_path,monkeypatch)
    patient,ph=create(c,'patient@test.example','patient')
    other,oh=create(c,'other@test.example','patient')
    doctor,dh=create(c,'doctor@test.example','doctor','synthetic-clinician-test-secret')
    assert c.get(f'/api/care/patients/{patient}/overview',headers=dh).status_code==403
    assert c.get(f'/api/care/patients/{other}/overview',headers=dh).status_code==403
    code=c.post('/api/care/share-invite',headers=ph).json()['share_code']
    assert c.post('/api/care/connect-patient',headers=dh,json={'share_code':code}).status_code==200
    assert c.post('/api/care/connect-patient',headers=dh,json={'share_code':code}).status_code==400
    assert c.get(f'/api/care/patients/{patient}/overview',headers=dh).status_code==200
    assert c.post('/api/care/plans',headers=ph,json={'patient_id':patient,'title':'Plan','actions':'Not clinician authored'}).status_code==403
    assert c.post('/api/care/plans',headers=dh,json={'patient_id':patient,'title':'Demo check-in','actions':'Schedule a clinician discussion'}).status_code==201
    assert len(c.get('/api/care/my-overview',headers=ph).json()['plans'])==1
    pred={'predictions':{k:{'positive_probability':0.25,'predicted_label':'Normal'} for k in ['CAD','LAD','LCX','RCA']}}
    assert c.post('/api/care/assessments',headers=ph,json={'patient_id':patient,'inputs':{'Age':40},'results':pred}).status_code==201
    doc=c.post(f'/api/care/patients/{patient}/documents?name=sample.pdf',headers={**ph,'Content-Type':'application/pdf'},content=b'%PDF-1.4\n%%demo')
    assert doc.status_code==201,doc.text
    doc_id=doc.json()['id']
    assert c.get(f'/api/care/documents/{doc_id}/download',headers=dh).status_code==200
    assert c.get(f'/api/care/documents/{doc_id}/download',headers=oh).status_code==403
    assert c.delete(f'/api/care/links/{doctor}',headers=ph).status_code==200
    assert c.get(f'/api/care/patients/{patient}/overview',headers=dh).status_code==403
    assert c.get(f'/api/care/documents/{doc_id}/download',headers=dh).status_code==403


def test_doctor_onboarding_denied_without_admin_secret(tmp_path,monkeypatch):
    c=client(tmp_path,monkeypatch)
    r=c.post('/api/care/signup',json={'email':'impostor@test.example','password':'FakeLongPassword!2026','role':'doctor','display_name':'Unauthorized','doctor_invite':'incorrect'})
    assert r.status_code==403
