import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.QA_PLAYWRIGHT_MODULE || 'playwright-core');
const dist=path.resolve(new URL('../../app/frontend/dist',import.meta.url).pathname);
const server=http.createServer((req,res)=>{const requested=path.join(dist,decodeURIComponent(req.url.split('?')[0]));const f=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.ttf')?'font/ttf':f.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const b=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage();
const user={user_id:'qa-user',name:'QA Student',email:'qa@example.test',gender:'male',onboarding_completed:false,signup_tour_eligible:true,college_verified:true,branch_name:'Computational Mathematics'};
const pool={pool_id:'qa-pool',user_id:'qa-owner',user_name:'QA Owner',user_email:'owner@example.test',from_location:'Mahindra University',to_location:'RGI Airport',travel_datetime:'2026-09-26T13:17:00Z',companions:0,total_seats:4,status:'open',trip_status:'confirmed',confirmed_travelers:[{user_id:user.user_id,name:user.name,email:user.email}],trip_conversation_id:'qa-chat',fare:{amount:800,currency:'INR'}};
const ride={pool_id:pool.pool_id,from_location:pool.from_location,to_location:pool.to_location,travel_datetime:pool.travel_datetime,other_user_id:pool.user_id,other_user_name:pool.user_name,other_user_email:pool.user_email,my_role:'traveler',conversation_id:'qa-chat'};
p.setDefaultTimeout(10000);let rides=[ride],calls=[],errors=[],failLeave=false,failProfile=false,failNotifications=false;
const checks=[];const check=(name)=>{checks.push(name);console.log('PASS',name);};
const group={group_id:'qa-circle',name:'QA Hostel',emoji:'💸',admins:[user.user_id],invite_code:'QA1234',member_ids:[user.user_id,pool.user_id]};
let expenses=[{expense_id:'qa-expense',description:'QA dinner',amount_paise:10000,paid_by:user.user_id,paid_by_name:user.name,created_by:user.user_id,category:'food',created_at:new Date().toISOString()}];
const detail=()=>({group,members:[user,{user_id:pool.user_id,name:pool.user_name,email:pool.user_email}],expenses,settlements:[],balances:[],simplified:[],my_balance_paise:0,month:{key:'2026-09',total_paise:10000,categories:{food:10000}},activity:[]});
let testNotifs=[];
p.on('pageerror',e=>errors.push(e.message));
await ctx.addInitScript(({user})=>{localStorage.setItem('unipool.session_token','qa-only-not-a-real-session');if(!localStorage.getItem('unipool.cached_user.v1'))localStorage.setItem('unipool.cached_user.v1',JSON.stringify(user));localStorage.setItem('unipool.theme.v1','light');localStorage.setItem('unipool.policy-consent.v1.qa-user.2026-08-30','1');},{user});
await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();
 if(!u.pathname.includes('/api')&&!u.pathname.includes('/functions/v1/'))return route.fulfill({status:200,body:''});
 const pathname=u.pathname.replace(/^.*\/functions\/v1\/[^/]+/,'').replace(/^.*\/api/,'');calls.push({method:req.method(),path:pathname,body:req.postData()});
 let data=[];
 if(pathname==='/notifications')return route.fulfill({status:200,json:testNotifs});
 if(/^\/profiles\/[^/]+$/.test(pathname)){const id=pathname.split('/')[2];if(id==='qa-missing')return route.fulfill({status:404,json:{detail:'User not found'}});return route.fulfill({status:200,json:{user_id:id,name:id==='qa-user'?user.name:pool.user_name,username:'qa-student',college_verified:true,school_name:'School of Sciences',branch_name:'Computational Mathematics',batch_year:2026}});}
 if(pathname==='/expense-groups/qa-circle')data=detail();
 else if(pathname==='/expense-groups')data=[group];
 else if(pathname==='/expense-groups/qa-circle/expenses/qa-expense'&&req.method()==='DELETE'){expenses=[];data={ok:true};}
 else if(pathname==='/personal-finance/dashboard')data={month:'2026-09',income_paise:0,expense_paise:0,net_cashflow_paise:0,transactions:[],categories:{}};
 else if(pathname==='/budgets')data={month:'2026-09',budgets:[],spent_by_category:{},income_paise:0,expense_paise:0,total_budget_paise:0,remaining_budget_paise:0,safe_to_spend_per_day_paise:0,safe_to_spend_week_paise:0};
 else if(pathname.includes('/reliability'))data={score:70,label:'QA test',completed_trips:0,average_rating:null,response_rate:null,cancellation_rate:0};
 else if(pathname==='/search/global')data={locations:[],rides:[],people:[],conversations:[]};
 else if(pathname.includes('/preferences'))data={pool_id:pool.pool_id,user_id:user.user_id,time_flex_minutes:60,max_detour_km:5,cab_preference:'any',quiet_ride:false,luggage_flexible:true};
 else if(pathname==='/profile'&&req.method()==='PATCH'&&failProfile)return route.fulfill({status:500,json:{detail:'QA profile failure'}});
 else if(pathname.includes('/notifications')&&req.method()!=='GET'&&failNotifications)return route.fulfill({status:500,json:{detail:'QA notification failure'}});
 else if(pathname==='/journeys/duplicates')data=[{...pool,time_delta_minutes:20}];
 else if(pathname==='/auth/me')data=user;
 else if(pathname==='/auth/password/status')data={has_password:true};
 else if(pathname.includes('microsoft/config'))data={enabled:false};
 else if(pathname.includes('policy-consent'))data={terms_version:'2026-08-30',privacy_version:'2026-08-30',accepted:true};
 else if(pathname==='/matches/confirmed')data=rides;
 else if(pathname==='/pools/qa-pool')data=pool;
 else if(pathname==='/pools'||pathname==='/pools/matches')data=req.method()==='POST'?pool:[pool];
 else if(pathname==='/pools/mine')data=[];
 else if(/^\/pools\/qa-pool\/travelers\/[^/]+$/.test(pathname)&&req.method()==='DELETE'){
  if(failLeave)return route.fulfill({status:500,json:{detail:'QA simulated failure'}});rides=[];data={ok:true};
 }
 else if(pathname.includes('/can-rate/'))data={can_rate:true,existing:null};
 else if(pathname.includes('/ratings/user/'))data={average:null,count:0,ratings:[]};
 else if(pathname.includes('/state'))data={pool_id:pool.pool_id,stage:'confirmed',member_count:2};
 else if(pathname.includes('/messages/group/'))data={name:'QA Trip',members:[user,{user_id:pool.user_id,name:pool.user_name}],messages:[{message_id:'qa-msg',from_user_id:pool.user_id,text:'QA pickup',created_at:new Date().toISOString()}]};
 else if(pathname==='/messages/conversations')data=[{kind:'direct',other_user_id:pool.user_id,name:pool.user_name,last_message:'QA hello',last_at:new Date().toISOString(),unread:0}];
 else if(pathname==='/saved')data=[{user_id:pool.user_id,name:pool.user_name}];
 else if(pathname==='/notifications')data=u.pathname.includes('/api/')?{items:[],unread:0}:[{id:'qa-notification',type:'trip',title:'QA notification',body:'Test notification',route:null,read_at:null,created_at:new Date().toISOString()}];
 else if(pathname==='/health')data={ok:true};
 else if(pathname==='/campus-home')data={saved_people:0,circles:0,unread_notifications:0,saved_routes:0,total_xp:0,level:1};
 else if(pathname==='/expense-dashboard')data={groups:[],total_owed_paise:0,total_owing_paise:0};
 else if(pathname==='/notification-preferences')data={enabled:true,categories:{}};
 return route.fulfill({status:200,json:data});
});
try{
 await p.goto(origin+'/matches');await p.getByTestId('tour-skip').click();await p.getByTestId('tour-skip').waitFor({state:'hidden'});assert(await p.evaluate(()=>localStorage.getItem('unipool.first_tour_done.v1.qa-user'))==='1');console.log('PASS Signup tour skip persists');
 delete user.onboarding_completed;await p.reload();await p.getByLabel('Leave shared trip').waitFor();assert.equal(await p.getByTestId('tour-skip').count(),0);console.log('PASS Omitted completion field does not replay tour');
 assert.equal(await p.getByLabel('Open Explore',{exact:true}).count(),0);console.log('PASS Header Explore removed');
 delete user.signup_tour_eligible;user.onboarding_completed=false;await p.evaluate(user=>{localStorage.removeItem('unipool.first_tour_done.v1.qa-user');localStorage.setItem('unipool.cached_user.v1',JSON.stringify(user));},user);await p.reload();await p.getByLabel('Leave shared trip').waitFor();assert.equal(await p.getByTestId('tour-skip').count(),0);console.log('PASS Returning accounts never get signup tour');
 await p.waitForTimeout(1000);testNotifs=[{id:'qa-new-message',type:'message',title:'QA Owner sent a message',body:'New QA pickup',route:'/chat/qa-owner',read_at:null,created_at:new Date().toISOString()}];
 await p.getByLabel('Open new message').waitFor({timeout:12000});await p.getByLabel('1 unread notifications',{exact:true}).waitFor();await p.getByLabel('Open new message').click();await p.waitForURL('**/chat/qa-owner');console.log('PASS New message banner, bell count and chat navigation');
 assert.equal(errors.length,0,errors.join('\n'));console.log('PASS No browser page errors');
}finally{await b.close();server.close();}
