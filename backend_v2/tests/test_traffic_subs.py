"""Real PostgreSQL + HTTP tests. Fixtures only; redirects never followed."""
import uuid
from datetime import date
from urllib.parse import urlsplit, parse_qs
from sqlalchemy import text
import test_stage3_neutral_links as links
from cpa_analytics import arguments, traffic_subs, countries

class TrafficSubsTests(links.NeutralLinkTests):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with links.engine.begin() as c:
            for definition in ('country_code varchar(2)', 'country_name varchar(100)', 'ip_address varchar(45)'):
                c.execute(text('ALTER TABLE clicks ADD COLUMN IF NOT EXISTS '+definition))
            c.execute(text('''CREATE TABLE IF NOT EXISTS conversions(
              id uuid PRIMARY KEY,user_id bigint,click_id varchar(80),created_at timestamptz,
              offer_id varchar(80),network_id bigint,vertical_slug text,is_test boolean DEFAULT false,
              status text,finance_eligible_at timestamptz,finance_approved_at timestamptz,
              currency text DEFAULT 'USD',payout_gross numeric DEFAULT 0,payout_net numeric DEFAULT 0)'''))
            c.execute(text('CREATE TABLE IF NOT EXISTS cpa_finance_epoch(id int PRIMARY KEY,activated_at timestamptz)'))
            c.execute(text("INSERT INTO cpa_finance_epoch VALUES(1,'2026-01-01') ON CONFLICT(id) DO NOTHING"))
            c.execute(text('''CREATE TABLE IF NOT EXISTS cpa_ledger(
              id bigserial PRIMARY KEY,conversion_id uuid,operation_type text,
              hold_delta numeric DEFAULT 0,balance_delta numeric DEFAULT 0)'''))

    def test_e_tag_roundtrip_without_network_collision(self):
        url=links.client.post('/cpa/links/'+self.offers[0],headers=links.headers(links.FIRST)).json()['url']
        tags={'sub1':'tiktok','sub2':'кампания & лето','sub3':'a+b?x=1','sub4':' creative ','sub5':'🎥'}
        response=links.client.get(urlsplit(url).path,params=tags)
        self.assertEqual(response.status_code,302,response.text)
        outgoing=parse_qs(urlsplit(response.headers['location']).query)
        self.assertEqual(outgoing['sub1'],['VVD951001'])
        self.assertNotIn('sub2',outgoing)
        with links.engine.connect() as c:
            row=c.execute(text('SELECT sub1,sub2,sub3,sub4,sub5 FROM clicks WHERE click_id=:cid'),{'cid':outgoing['tracking_key'][0]}).mappings().one()
            self.assertEqual(dict(row),{k:v.strip() for k,v in tags.items()})
        for params in ([('sub1','a'),('sub1','b')],{'sub2':'x'*129},{'sub5':'a\nb'}):
            self.assertEqual(links.client.get(urlsplit(url).path,params=params).status_code,422)
        self.assertEqual(links.client.get(f'/statistics/{links.FIRST}/subs').status_code,401)
        self.assertEqual(links.client.get(f'/statistics/{links.FIRST}/subs',headers=links.headers(links.SECOND)).status_code,403)
        self.assertEqual(links.client.get(f'/statistics/{links.FIRST}/subs?field=ip_address',headers=links.headers(links.FIRST)).status_code,422)
        ok=links.client.get(f'/statistics/{links.FIRST}/subs',headers=links.headers(links.FIRST))
        self.assertEqual(ok.status_code,200,ok.text)
        self.assertNotIn('ip_address',ok.text)

    def test_f_aggregation_dates_owner_and_finance(self):
        # Rollback test facts so inherited fixtures and live data are untouched.
        with links.engine.connect() as c:
            tx=c.begin()
            try:
                def click(tag,day='2026-10-20 10:00',uid=links.FIRST):
                    cid=str(uuid.uuid4())
                    c.execute(text('''INSERT INTO clicks(user_id,partner_code,click_id,vertical,offer_id,network_id,created_at,sub1,sub2)
                      VALUES(:uid,'VVD951001',:cid,'utilities',:offer,:network,:day,:tag,'campaign')'''),
                      {'uid':uid,'cid':cid,'offer':self.offers[0],'network':self.net_id,'day':day,'tag':tag})
                    return cid
                def conv(cid,uid=links.FIRST,status='approved',test=False):
                    vid=str(uuid.uuid4())
                    c.execute(text('''INSERT INTO conversions(id,user_id,click_id,created_at,offer_id,network_id,vertical_slug,status,is_test,finance_eligible_at)
                      VALUES(:id,:uid,:cid,'2026-10-20 12:00+00',:offer,:network,'utilities',:status,:test,'2026-10-20 12:00+00')'''),
                      {'id':vid,'uid':uid,'cid':cid,'offer':self.offers[0],'network':self.net_id,'status':status,'test':test})
                    return vid
                a=click('tiktok');click('tiktok');click(None)
                old=click('yesterday','2026-10-19 10:00')
                foreign=click('private',uid=links.SECOND)
                v=conv(a);pending_id=conv(a,status='pending');conv(a,status='rejected');conv(a,test=True);conv(a,status='1');conv(old)
                conv(foreign,uid=links.SECOND)
                c.execute(text("UPDATE conversions SET payout_gross=0.35 WHERE id=:id"),{'id':pending_id})
                # Corrupt foreign click link must not disclose the other owner's tag.
                conv(foreign)
                for kind,hold,balance in [('hold_credit',10,0),('hold_release',-4,4),('platform_fee_accrual',0,0)]:
                    c.execute(text('INSERT INTO cpa_ledger(conversion_id,operation_type,hold_delta,balance_delta) VALUES(:v,:kind,:hold,:balance)'),{'v':v,'kind':kind,'hold':hold,'balance':balance})
                p=arguments('all',date(2026,10,20),date(2026,10,20),None,self.offers[0],None,'UTC')
                rows={r['value']:r for r in traffic_subs(c,links.FIRST,p)['rows']}
                self.assertEqual(rows['tiktok']['clicks'],2)
                self.assertEqual(rows['tiktok']['conversions'],3)
                self.assertEqual(rows['tiktok']['income'],10)
                self.assertEqual(rows['tiktok']['pending_income'],0.28)
                self.assertEqual(sum(r['pending_income'] for r in countries(c,links.FIRST,p)),0.28)
                # Approval/rejection removes the estimate; no double counting or wallet writes.
                for state in ('approved','rejected'):
                    c.execute(text('UPDATE conversions SET status=:state WHERE id=:id'),{'id':pending_id,'state':state})
                    self.assertEqual(sum(r['pending_income'] for r in traffic_subs(c,links.FIRST,p)['rows']),0)
                c.execute(text("UPDATE conversions SET status='pending' WHERE id=:id"),{'id':pending_id})
                self.assertEqual(rows['tiktok']['hold'],6)
                self.assertEqual(rows['tiktok']['cr'],150)
                self.assertEqual(rows['tiktok']['epc'],5)
                self.assertEqual(rows['yesterday']['clicks'],0)
                self.assertEqual(rows['yesterday']['conversions'],1)
                self.assertIsNone(rows['yesterday']['cr'])
                self.assertNotIn('private',rows)
                self.assertEqual(rows[None]['conversions'],1)
                self.assertEqual(traffic_subs(c,links.FIRST,p,search='TIK')['rows'][0]['value'],'tiktok')
                self.assertEqual(traffic_subs(c,links.FIRST,p,search="%' OR 1=1 --")['rows'],[])
                first=traffic_subs(c,links.FIRST,p,limit=1)
                self.assertTrue(first['has_more'])
                self.assertNotEqual(first['rows'][0]['value'],traffic_subs(c,links.FIRST,p,limit=1,offset=1)['rows'][0]['value'])
                for field in ('sub2','sub3','sub4','sub5'):
                    self.assertEqual(sum(r['clicks'] for r in traffic_subs(c,links.FIRST,p,field=field)['rows']),3)
                p['offer']=self.offers[1]
                self.assertEqual(traffic_subs(c,links.FIRST,p)['rows'],[])
            finally:
                tx.rollback()
