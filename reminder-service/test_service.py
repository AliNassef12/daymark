import os
import tempfile
import unittest
from service import create_app, process_due, connect

class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        os.environ['REMINDER_DB']=self.tmp.name+'/test.sqlite3'
        os.environ['REMINDER_BRIDGE_TOKEN']='x'*40
        self.client=create_app().test_client()
        self.headers={'Authorization':'Bearer '+'x'*40}
        self.now=1800000000000
    def tearDown(self): self.tmp.cleanup()
    def sync(self,items,rev=1,owner='u1'):
        return self.client.post('/sync',headers=self.headers,json={'owner':owner,'email':'test@example.com','revision':rev,'items':items})
    def item(self,id='task:1',offset=7200000):
        return {'id':id,'title':'Test task','deadline':self.now+offset}
    def test_threshold_and_deduplication(self):
        self.sync([self.item(),self.item('task:2',7200001)])
        sent=[]
        self.assertEqual(process_due(self.now,lambda j:sent.append(j['id'])),1)
        self.assertEqual(sent,['task:1'])
        self.assertEqual(process_due(self.now,lambda j:sent.append(j['id'])),0)
    def test_cancel_edit_and_stale_sync(self):
        self.sync([self.item()]); self.sync([],2); self.sync([self.item()],1)
        self.assertEqual(process_due(self.now,lambda j:None),0)
        self.sync([self.item(offset=3600000)],3)
        self.assertEqual(process_due(self.now,lambda j:None),1)
        self.sync([self.item(offset=3600001)],4)
        self.assertEqual(process_due(self.now,lambda j:None),1)
    def test_failure_retries_and_owner_isolation(self):
        self.sync([self.item()]);self.sync([self.item()],owner='u2');self.sync([],2)
        def fail(j):raise RuntimeError('mock SMTP failure')
        self.assertEqual(process_due(self.now,fail),0)
        self.assertEqual(process_due(self.now+30001,lambda j:None),1)
    def test_auth_validation_and_overdue(self):
        self.assertEqual(self.client.post('/sync',json={}).status_code,401)
        self.assertEqual(self.sync([{'id':'bad'}]).status_code,400)
        self.sync([self.item(offset=-1)])
        self.assertEqual(process_due(self.now,lambda j:None),0)

if __name__=='__main__':unittest.main()
