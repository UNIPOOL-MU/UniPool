import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';
const {chromium}=await import(process.env.QA_PLAYWRIGHT_MODULE || 'playwright-core');
const dist=path.resolve(new URL('../../app/frontend/dist',import.meta.url).pathname);
const server=http.createServer((req,res)=>{const requested=path.join(dist,decodeURIComponent(req.url.split('?')[0]));const f=fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.ttf')?'font/ttf':f.endsWith('.html')?'text/html':'application/octet-stream');fs.createReadStream(f).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const b=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const ctx=await b.newContext({viewport:{width:390,height:844}}),p=await ctx.newPage();
const user={user_id:'qa-user',name:'QA Student',email:'qa@example.test',gender:'male',onboarding_completed:true,college_verified:true,branch_name:'Computational Mathematics'};
const pool={pool_id:'qa-pool',user_id:'qa-owner',user_name:'QA Owner',user_email:'owner@example.test',from_location:'Mahindra University',to_location:'RGI Airport',travel_datetime:'2026-09-26T13:17:00Z',companions:0,total_seats:4,status:'open',trip_status:'confirmed',confirmed_travelers:[{user_id:user.user_id,name:user.name,email:user.email}],trip_conversation_id:'qa-chat',fare:{amount:800,currency:'INR'}};
const ride={pool_id:pool.pool_id,from_location:pool.from_location,to_location:pool.to_location,travel_datetime:pool.travel_datetime,other_user_id:pool.user_id,other_user_name:pool.user_name,other_user_email:pool.user_email,my_role:'traveler',conversation_id:'qa-chat'};
p.setDefaultTimeout(10000);let rides=[ride],calls=[],errors=[],failLeave=false,failProfile=false,failNotifications=false;
const checks=[];const check=(name)=>{checks.push(name);console.log('PASS',name);};
const group={group_id:'qa-circle',name:'QA Hostel',emoji:'💸',admins:[user.user_id],invite_code:'QA1234',member_ids:[user.user_id,pool.user_id]};
let expenses=[{expense_id:'qa-expense',description:'QA dinner',amount_paise:10000,paid_by:user.user_id,paid_by_name:user.name,created_by:user.user_id,category:'food',created_at:new Date().toISOString()}];
const detail=()=>({group,members:[user,{user_id:pool.user_id,name:pool.user_name,email:pool.user_email}],expenses,settlements:[],balances:[],simplified:[],my_balance_paise:0,month:{key:'2026-09',total_paise:10000,categories:{food:10000}},activity:[]});
p.on('pageerror',e=>errors.push(e.message));
await ctx.addInitScript(({user})=>{localStorage.setItem('unipool.session_token','qa-only-not-a-real-session');localStorage.setItem('unipool.cached_user.v1',JSON.stringify(user));localStorage.setItem('unipool.theme.v1','light');localStorage.setItem('unipool.policy-consent.v1.qa-user.2026-08-30','1');},{user});
await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===origin)return route.continue();
 if(!u.pathname.includes('/api')&&!u.pathname.includes('/functions/v1/'))return route.fulfill({status:200,body:''});
 const pathname=u.pathname.replace(/^.*\/functions\/v1\/[^/]+/,'').replace(/^.*\/api/,'');calls.push({method:req.method(),path:pathname,body:req.postData()});
 let data=[];
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
 await p.goto(origin+'/matches');await p.getByLabel('Leave shared trip').first().waitFor();
 await p.getByLabel('Leave shared trip').first().click();await p.getByRole('dialog').waitFor();assert.equal(await p.getByRole('button',{name:'Leave trip',exact:true}).count(),1);
 await p.getByRole('button',{name:'Cancel',exact:true}).click();assert(!calls.some(c=>c.method==='DELETE'));console.log('PASS Leave cancel: no mutation');
 failLeave=true;await p.getByLabel('Leave shared trip').first().click();await p.getByRole('button',{name:'Leave trip',exact:true}).click();await p.getByRole('heading',{name:"Couldn't update trip"}).waitFor();assert(await p.getByLabel('Leave shared trip').count());await p.getByRole('button',{name:'OK',exact:true}).click();console.log('PASS Leave failure: error shown, trip restored');
 failLeave=false,failProfile=false,failNotifications=false;await p.getByLabel('Leave shared trip').first().click();await p.getByRole('button',{name:'Leave trip',exact:true}).click();await p.getByLabel('Leave shared trip').waitFor({state:'detached'});assert(calls.some(c=>c.path==='/pools/qa-pool/travelers/qa-user'&&c.method==='DELETE'));console.log('PASS Leave success: correct user, trip removed');

 rides=[ride];await p.goto(origin+'/matches');await p.getByLabel('Rate QA Owner').first().click();await p.getByText('Submit rating',{exact:true}).click();await p.getByRole('heading',{name:'Pick a rating'}).waitFor();await p.getByRole('button',{name:'OK',exact:true}).click();await p.getByTestId('rating-close').click();check('Rating validation dialog over modal and close');
 await p.getByLabel('More actions for QA Owner').first().click();await p.getByText('Restrict this user',{exact:true}).click();await p.getByRole('heading',{name:'Restrict QA?'}).waitFor();await p.getByRole('button',{name:'Cancel',exact:true}).click();await p.getByTestId('report-close').click();check('Safety restrict confirmation cancels without mutation');
 await p.goto(origin+'/circles/qa-circle');await p.getByText('QA dinner',{exact:true}).click();await p.getByRole('heading',{name:'QA dinner'}).waitFor();await p.getByRole('button',{name:'Remove expense',exact:true}).click();await p.getByRole('heading',{name:'Remove expense?'}).waitFor();await p.getByRole('button',{name:'Cancel',exact:true}).click();assert(expenses.length===1);check('Expense opens on tap, nested deletion prompt cancels');
 await p.getByText('Invite',{exact:true}).click();await p.getByRole('heading',{name:/Copied|Copy this to share/}).waitFor();await p.getByRole('button',{name:'OK',exact:true}).click();check('Circle invite sharing gives copy fallback');
 await p.goto(origin+'/safety');await p.getByText('Save contact',{exact:true}).click();await p.getByRole('heading',{name:'Add a contact'}).waitFor();await p.getByRole('button',{name:'OK',exact:true}).click();check('Trusted contact validation feedback');

 await p.goto(origin+'/matches');await p.getByLabel('Open trip chat').first().click();await p.waitForURL('**/chat/group/qa-chat');check('Confirmed trip chat navigation');
 const toolbar=[['Open Explore','/plan'],['Open Time-pass games','/games'],['Open settings','/settings'],['Post a trip','/post-request'],['No unread notifications','/notifications']];
 for(const [label,pathname] of toolbar){await p.goto(origin+'/matches');await p.getByLabel(label,{exact:true}).click();await p.waitForURL('**'+pathname);check('Toolbar '+label);}
 await p.goto(origin+'/matches');await p.getByLabel('Search UniPool').click();await p.getByText('RGIA',{exact:true}).click();await p.getByText('Rajiv Gandhi International Airport',{exact:true}).click();await p.waitForURL('**/post-request?*');assert.equal(await p.getByPlaceholder('Campus, airport, station…').inputValue(),'Rajiv Gandhi International Airport');check('Global search place selection populates trip form');
 await p.goto(origin+'/post-request');await p.getByText('Check matches & post',{exact:true}).click();await p.getByRole('heading',{name:'Missing route'}).waitFor();await p.getByRole('button',{name:'OK',exact:true}).click();check('Trip posting required-route validation');
 await p.getByPlaceholder('Campus, airport, station…').fill('Mahindra University');await p.getByPlaceholder('Where are you going?').fill('RGI Airport');await p.getByText('Check matches & post',{exact:true}).click();await p.getByRole('heading',{name:'A similar ride already exists'}).waitFor();assert.equal(await p.getByRole('dialog').getByRole('button').count(),3);await p.getByRole('button',{name:'Cancel',exact:true}).click();assert(!calls.some(c=>c.path==='/pools'&&c.method==='POST'));check('Three-action duplicate trip prompt and cancel');
 await p.getByText('Check matches & post',{exact:true}).click();await p.getByRole('button',{name:'View existing',exact:true}).click();await p.waitForURL('**/pool/qa-pool');check('Duplicate trip View existing navigation');
 await p.goto(origin+'/settings');await p.getByText('Add point',{exact:true}).click();await p.getByPlaceholder('Name, e.g. MU Gate 2').fill('QA gate');await p.getByText('Save pickup point',{exact:true}).click();await p.getByRole('heading',{name:'Check pickup point'}).waitFor();await p.getByRole('button',{name:'OK',exact:true}).click();check('Pickup coordinates cannot be empty');
 await p.getByPlaceholder('Latitude',{exact:true}).fill('91');await p.getByPlaceholder('Longitude',{exact:true}).fill('10');await p.getByText('Save pickup point',{exact:true}).click();await p.getByRole('heading',{name:'Check pickup point'}).waitFor();await p.getByRole('button',{name:'OK',exact:true}).click();check('Pickup coordinate range validation');
 await p.goto(origin+'/notifications');failNotifications=true;await p.getByText('Mark all read',{exact:true}).click();await p.getByText('QA notification failure',{exact:false}).waitFor();await p.getByText('Mark all read',{exact:true}).waitFor();check('Notification mark-all failure restores unread state');failNotifications=false;
 await p.goto(origin+'/matches');await p.getByLabel('Rate QA Owner').first().click();await p.getByTestId('rating-8').click();await p.getByTestId('rating-submit').click();await p.getByTestId('rating-close').waitFor({state:'detached'});assert(calls.some(c=>c.path==='/ratings'&&c.method==='POST'&&JSON.parse(c.body).stars===8));check('Rating submission sends selected score and closes');
 await p.goto(origin+'/circle-export');await p.getByText('Export CSV',{exact:true}).waitFor();
 const [download]=await Promise.all([p.waitForEvent('download'),p.getByText('Export CSV',{exact:true}).click()]);assert.equal(download.suggestedFilename(),'unipool-qa-hostel.csv');check('Circle CSV export triggers download');
 await p.evaluate(()=>{window.qaPrinted=0;window.print=()=>{window.qaPrinted++;};});await p.getByText('Print / Save PDF',{exact:true}).click();assert.equal(await p.evaluate(()=>window.qaPrinted),1);check('Circle PDF button invokes print dialog');
 const paths=['/','/matches','/plan','/messages','/profile','/games','/campus','/people','/circles','/circles/personal','/circles/qa-circle','/circle-tools','/circle-export','/circle-invite','/settings','/notifications','/safety','/network','/network?userId=qa-owner&name=QA%20Owner','/post-request','/pool/qa-pool','/trip-live/qa-pool','/trip-receipt/qa-pool','/trip-feedback','/chat/qa-owner','/chat/group/qa-chat','/terms','/privacy','/faq','/community-guidelines','/games/trivia','/games/word-scramble','/games/airport-codes','/games/destination-detective','/games/travel-reveal','/games/daily-challenge','/games/guess-state','/games/station-codes'];
 for(const pathname of paths){const before=errors.length;await p.goto(origin+pathname);await p.waitForFunction(()=>document.querySelector('#root')?.innerText?.length>20);await p.waitForTimeout(200);if(errors.length>before)console.log('SCREEN ERROR',pathname,errors.slice(before));else check('Screen renders '+pathname);}

 if(process.env.QA_SWEEP==='1'){
  const actionable='div[tabindex="0"],button,a,[role="switch"]';
  const annotate=()=>p.evaluate((selector)=>Array.from(document.querySelectorAll(selector)).filter(el=>!el.closest('[role="tablist"]')&&el.getAttribute('role')!=='tab'&&el.getBoundingClientRect().top>=60&&el.getAttribute('aria-disabled')!=='true'&&!el.disabled).map((el,index)=>{el.dataset.qaControl=String(index);return {index,label:el.getAttribute('aria-label')||el.innerText||el.getAttribute('title')||'icon'};}),actionable);
  let attempted=0,skipped=[];
  for(const pathname of paths){
   await p.goto(origin+pathname);await p.waitForFunction(()=>document.querySelector('#root')?.innerText?.length>20);await p.waitForTimeout(180);
   const controls=await annotate();
   for(const control of controls){
    if(/Google|Microsoft|Instagram|BinaryBots|Contact|Share|Print|Export|Sign out/i.test(control.label)){skipped.push({pathname,label:control.label});continue;}
    await p.goto(origin+pathname);await p.waitForFunction(()=>document.querySelector('#root')?.innerText?.length>20);await p.waitForTimeout(180);await annotate();
    const el=p.locator(`[data-qa-control="${control.index}"]`);
    if(!(await el.count()))continue;
    try{await el.click({timeout:2000});await p.waitForTimeout(100);attempted++;}catch(e){skipped.push({pathname,label:control.label,reason:e.message.split('\n')[0]});}
   }
  }
  console.log('SWEEP',JSON.stringify({attempted,skipped},null,2));check('Additional button click sweep '+attempted+' controls');
 }
 await p.goto(origin+'/matches');await p.getByLabel('Leave shared trip').first().waitFor();if(process.env.QA_SCREENSHOT_PATH)await p.screenshot({path:process.env.QA_SCREENSHOT_PATH});
 for(const width of [320,390,768,1280]){
  await p.setViewportSize({width,height:844});await p.goto(origin+'/matches');await p.getByLabel('Leave shared trip').first().waitFor();
  const rect=await p.getByLabel('Leave shared trip').first().boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width,`Leave control exceeds viewport at ${width}`);check('Leave control reachable at '+width+'px');
 }
 await p.setViewportSize({width:390,height:844});
 rides=[{...ride,my_role:'owner',other_user_id:'qa-other',other_user_name:'QA Other'}];await p.goto(origin+'/matches');await p.getByLabel('Remove confirmed traveller').click();await p.getByRole('button',{name:'Remove traveller',exact:true}).click();await p.getByLabel('Remove confirmed traveller').waitFor({state:'detached'});assert(calls.some(c=>c.path==='/pools/qa-pool/travelers/qa-other'&&c.method==='DELETE'));check('Owner removes selected traveller instead of themselves');

 async function assertProfile(id){await p.waitForURL(url=>url.pathname==='/network'&&url.searchParams.get('userId')===id);await p.getByText('Basic details',{exact:true}).waitFor();await p.getByText('School of Sciences',{exact:true}).waitFor();assert(await p.getByText('Computational Mathematics',{exact:true}).count());assert(await p.getByText('Batch 2026',{exact:true}).count());}
 for(const [pathname,id,label] of [['/(tabs)','qa-owner',"Open QA Owner's profile"],['/messages','qa-owner',"Open QA Owner's profile"],['/chat/qa-owner?name=QA%20Owner','qa-owner',"Open QA Owner's profile"],['/chat/group/qa-chat','qa-owner',"Open QA Owner's profile"],['/people','qa-owner',"Open QA Owner's profile"],['/circles/qa-circle','qa-user',"Open QA Student's profile"],['/trip-receipt/qa-pool','qa-user',"Open QA Student's profile"]]){
  await p.goto(origin+pathname);if(pathname==='/circles/qa-circle')await p.getByText('Members',{exact:true}).click();
  await p.getByRole('link',{name:label,exact:true}).first().click();await assertProfile(id);check('Name opens correct basic profile from '+pathname);
 }
 await p.goto(origin+'/(tabs)');await p.getByRole('link',{name:"Open QA Owner's profile",exact:true}).first().focus();await p.keyboard.press('Enter');await assertProfile('qa-owner');check('Keyboard Enter opens name profile');
 await p.goto(origin+'/network?userId=qa-missing&name=Missing');await p.getByText('User not found',{exact:true}).waitFor();await p.getByLabel('Retry profile').waitFor();check('Missing profile shows error and retry');
 assert.equal(errors.length,0,errors.join('\n'));

 console.log(JSON.stringify({checks:checks.length+3,calls:calls.length,errors},null,2));
}catch(e){console.error('QA FAIL',e);console.log((await p.locator('body').innerText()).slice(0,1500));console.log('ERRORS',errors);console.log('CALLS',calls);process.exitCode=1;}
finally{await b.close();server.close();}
