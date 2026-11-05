(() => {
"use strict";
const DB_KEY = "chorujaro_roast_manager_v1";
const $ = (id) => document.getElementById(id);
const state = { beans: [], roasts: [], timerSeconds: 0, timerRunning: false, timerStartedAt: null, timerInterval: null, points: [], events: [], deferredInstall: null };
const nowISO = () => new Date().toISOString();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
function loadData() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.beans = Array.isArray(data.beans) ? data.beans : [];
    state.roasts = Array.isArray(data.roasts) ? data.roasts : [];
    const draft = data.activeSession || {};
    state.points = Array.isArray(draft.points) ? draft.points : [];
    state.events = Array.isArray(draft.events) ? draft.events : [];
    state.timerSeconds = Number(draft.timerSeconds) || 0;
    state.timerRunning = Boolean(draft.timerRunning && draft.timerStartedAt);
    state.timerStartedAt = state.timerRunning ? Number(draft.timerStartedAt) : null;
  } catch (e) { console.error("データ読み込みエラー", e); toast("保存データを読み込めませんでした"); }
}
function persist() {
  try { localStorage.setItem(DB_KEY, JSON.stringify({ schemaVersion: 1, updatedAt: nowISO(), beans: state.beans, roasts: state.roasts,
      activeSession: { points: state.points, events: state.events, timerSeconds: state.timerSeconds, timerRunning: state.timerRunning, timerStartedAt: state.timerStartedAt } })); return true; }
  catch (e) { console.error(e); toast("保存容量が不足しています。バックアップ後に整理してください"); return false; }
}
let toastTimer;
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmtTime(seconds) { const s = Math.max(0, Math.floor(seconds)); return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }
function elapsed() { return state.timerSeconds + (state.timerRunning && state.timerStartedAt ? Math.floor((Date.now()-state.timerStartedAt)/1000) : 0); }
function renderTimer() { $("timerDisplay").textContent = fmtTime(elapsed()); $("startPauseBtn").textContent = state.timerRunning ? "一時停止" : (state.timerSeconds ? "再開" : "スタート"); }
function startTimer() {
  if (state.timerRunning) { state.timerSeconds = elapsed(); state.timerRunning = false; state.timerStartedAt = null; clearInterval(state.timerInterval); state.timerInterval = null; }
  else { state.timerRunning = true; state.timerStartedAt = Date.now(); state.timerInterval = setInterval(renderTimer, 250); }
  renderTimer(); persist();
}
function resetTimer() { state.timerRunning=false; state.timerSeconds=0; state.timerStartedAt=null; clearInterval(state.timerInterval); state.timerInterval=null; renderTimer(); persist(); }
function selectedBean() { return state.beans.find(b => b.id === $("roastBeanSelect").value); }
function drawChart() {
  const canvas=$("roastChart"); if(!canvas) return;
  const rect=canvas.getBoundingClientRect(); const dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(rect.width*dpr)); canvas.height=Math.max(1,Math.round(rect.height*dpr));
  const ctx=canvas.getContext("2d"); ctx.scale(dpr,dpr);
  const w=rect.width,h=rect.height, pad={l:39,r:12,t:12,b:25};
  const plotW=w-pad.l-pad.r, plotH=h-pad.t-pad.b;
  const bean=selectedBean(); const master=(bean?.masterCurve||[]);
  const all=[...master,...state.points];
  const maxX=Math.max(300,...all.map(p=>Number(p.t)||0),elapsed());
  const minY=0, maxY=Math.max(240,...all.map(p=>Number(p.temp)||0).map(v=>Math.ceil(v/20)*20));
  const x=t=>pad.l+(t/maxX)*plotW, y=v=>pad.t+plotH-((v-minY)/(maxY-minY))*plotH;
  ctx.clearRect(0,0,w,h); ctx.font="10px sans-serif"; ctx.textAlign="right"; ctx.textBaseline="middle";
  for(let v=0;v<=maxY;v+=40){const yy=y(v);ctx.strokeStyle="#ece9e1";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad.l,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle="#96978f";ctx.fillText(String(v),pad.l-7,yy);}
  for(let t=0;t<=maxX;t+=Math.max(60,Math.ceil(maxX/5/60)*60)){const xx=x(t);ctx.strokeStyle="#f0eee8";ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,pad.t+plotH);ctx.stroke();ctx.textAlign="center";ctx.textBaseline="top";ctx.fillStyle="#96978f";ctx.fillText(fmtTime(t),xx,h-18);}
  function line(points,color,width){if(!points.length)return;ctx.beginPath();points.forEach((p,i)=>{const xx=x(Number(p.t)||0),yy=y(Number(p.temp)||0);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy);});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin="round";ctx.lineCap="round";ctx.stroke();points.forEach(p=>{ctx.beginPath();ctx.arc(x(Number(p.t)||0),y(Number(p.temp)||0),2.7,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();});}
  line(master,"#6386a7",2.5); line(state.points,"#d8874e",2.8);
  state.events.forEach(ev=>{
    const xx=x(ev.t), color=ev.type==="1ハゼ"?"#0d9488":ev.type==="2ハゼ"?"#8b5cf6":"#596b55";
    ctx.save();
    if(ev.type==="煎り止め"){ctx.setLineDash([4,4]);ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(xx,pad.t);ctx.lineTo(xx,pad.t+plotH);ctx.stroke();}
    let eventTemp=Number(ev.temp);
    if(!Number.isFinite(eventTemp)){const prior=state.points.filter(p=>p.t<=ev.t).sort((a,b)=>b.t-a.t)[0];if(prior)eventTemp=Number(prior.temp);}
    if(Number.isFinite(eventTemp)){
      const yy=y(eventTemp);ctx.beginPath();ctx.arc(xx,yy,6,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle="#fffefa";ctx.stroke();
      ctx.font="bold 10px sans-serif";ctx.textAlign="left";ctx.textBaseline="bottom";ctx.fillStyle=color;ctx.fillText(ev.type,Math.min(xx+7,w-48),Math.max(pad.t+12,yy-7));
    }else{ctx.fillStyle=color;ctx.beginPath();ctx.arc(xx,pad.t+8,4,0,Math.PI*2);ctx.fill();ctx.font="10px sans-serif";ctx.textAlign="left";ctx.textBaseline="top";ctx.fillText(ev.type,Math.min(xx+5,w-48),pad.t+12);}
    ctx.restore();
  });
  if(!master.length && !state.points.length){ctx.fillStyle="#a3a39b";ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="12px sans-serif";ctx.fillText("温度を記録するとカーブが表示されます",w/2,h/2);}
  $("chartSubtitle").textContent=bean ? `${bean.name}｜青：マスター / 橙：今回` : "豆を選択するとマスターカーブを表示します";
}
function renderBeans() {
  const select=$("roastBeanSelect"), filter=$("historyBeanFilter"), old=select.value, oldFilter=filter.value;
  select.innerHTML='<option value="">豆を選択してください</option>'+state.beans.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");
  filter.innerHTML='<option value="">すべての豆</option>'+state.beans.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");
  if(state.beans.some(b=>b.id===old))select.value=old;if(state.beans.some(b=>b.id===oldFilter))filter.value=oldFilter;
  $("beanCount").textContent=state.beans.length+"件";
  $("beanList").innerHTML=state.beans.length?state.beans.map(b=>`<article class="list-card"><div class="list-card-top"><div><h3>${esc(b.name)}</h3><p>${esc([b.origin,b.process,b.variety].filter(Boolean).join(" / ")||"詳細未登録")}</p><p>${(b.masterCurve||[]).length}点のマスターカーブ</p></div></div><div class="card-actions"><button class="mini-button" data-edit-bean="${esc(b.id)}">編集</button><button class="mini-button danger" data-delete-bean="${esc(b.id)}">削除</button></div></article>`).join(""):'<div class="empty-state">豆マスターはまだありません。上のフォームから登録してください。</div>';
  drawChart();
}
function addMasterRow(t="",temp="") {
  const row=document.createElement("div");row.className="master-row";
  row.innerHTML=`<input type="number" min="0" step="1" inputmode="numeric" placeholder="時間（秒）" aria-label="時間（秒）" value="${esc(t)}"><input type="number" step="0.1" inputmode="decimal" placeholder="温度（°C）" aria-label="温度（°C）" value="${esc(temp)}"><button type="button" class="remove-point" aria-label="この点を削除">×</button>`;
  row.querySelector("button").addEventListener("click",()=>row.remove());$("masterPoints").appendChild(row);
}
function resetBeanForm() { $("beanForm").reset();$("beanId").value="";$("beanFormTitle").textContent="豆を登録";$("masterPoints").innerHTML="";addMasterRow(0,30);addMasterRow(120,100);addMasterRow(300,150); }
function editBean(id) {
  const b=state.beans.find(x=>x.id===id);if(!b)return;
  $("beanId").value=b.id;$("beanName").value=b.name||"";$("beanOrigin").value=b.origin||"";$("beanProcess").value=b.process||"";$("beanVariety").value=b.variety||"";$("beanMemo").value=b.memo||"";
  $("masterPoints").innerHTML="";(b.masterCurve||[]).forEach(p=>addMasterRow(p.t,p.temp));if(!(b.masterCurve||[]).length)addMasterRow();
  $("beanFormTitle").textContent="豆マスターを編集";window.scrollTo({top:0,behavior:"smooth"});
}
function saveBean(e) {
  e.preventDefault();const id=$("beanId").value;
  const masterCurve=[...$("masterPoints").querySelectorAll(".master-row")].map(row=>{const inputs=row.querySelectorAll("input");return {t:Number(inputs[0].value),temp:Number(inputs[1].value)};}).filter(p=>Number.isFinite(p.t)&&Number.isFinite(p.temp)&&p.t>=0).sort((a,b)=>a.t-b.t);
  const bean={id:id||uid(),name:$("beanName").value.trim(),origin:$("beanOrigin").value.trim(),process:$("beanProcess").value.trim(),variety:$("beanVariety").value.trim(),memo:$("beanMemo").value.trim(),masterCurve,updatedAt:nowISO()};
  if(!bean.name){toast("豆の名前を入力してください");return;}
  if(id){const i=state.beans.findIndex(b=>b.id===id);if(i>=0)state.beans[i]=bean;}else state.beans.push(bean);
  persist();resetBeanForm();renderBeans();toast("豆マスターを保存しました");
}
function updateTemperatureDisplay() {
  const value=$("currentTemp").value;
  $("currentTempDisplay").textContent=value||"---";
}
function pressTemperatureKey(key) {
  let value=$("currentTemp").value;
  if(key==="clear")value="";
  else if(key==="delete")value=value.slice(0,-1);
  else if(/^\d$/.test(key)){if(value.length>=3){toast("温度は3桁まで入力できます");return;}value+=key;}
  $("currentTemp").value=value;updateTemperatureDisplay();
}
function recordPoint() {
  const raw=$("currentTemp").value;if(raw===""){toast("数字ボタンで温度を入力してください");return;}
  const temp=Number(raw);if(!Number.isInteger(temp)||temp<0||temp>400){toast("温度は0〜400℃の整数で入力してください");return;}
  const t=elapsed();state.points.push({t,temp});state.points.sort((a,b)=>a.t-b.t);persist();$("currentTemp").value="";updateTemperatureDisplay();drawChart();toast(`${fmtTime(t)} / ${temp}°C を記録しました`);
}
function addEvent(type) {
  const existing=state.events.find(e=>e.type===type);if(existing){toast(type+"はすでに記録されています");return;}
  const t=elapsed();
  const typed=$("currentTemp").value;
  const prior=state.points.filter(p=>p.t<=t).sort((a,b)=>b.t-a.t)[0];
  const temp=typed!==""?Number(typed):(prior?Number(prior.temp):null);
  state.events.push({type,t,...(Number.isFinite(temp)?{temp}:{})});persist();renderEvents();drawChart();toast(`${type}を ${fmtTime(t)}${Number.isFinite(temp)?` / ${temp}°C`:""} に記録しました`);
}
function renderEvents() {
  $("eventLog").innerHTML=state.events.length?state.events.map(e=>`<span class="event-chip">${esc(e.type)} ${fmtTime(e.t)}${Number.isFinite(Number(e.temp))?` / ${esc(e.temp)}℃`:""}</span>`).join(""):'<span class="muted">イベントはまだ記録されていません</span>';
}
function saveRoast() {
  const bean=selectedBean();if(!bean){toast("使用する豆を選択してください");return;}if(!state.points.length){toast("温度を1点以上記録してください");return;}
  const roast={id:uid(),date:nowISO(),beanId:bean.id,beanName:bean.name,weight:Number($("roastWeight").value)||null,level:$("roastLevel").value,points:state.points.map(p=>({...p})),events:state.events.map(e=>({...e})),memo:$("roastMemo").value.trim(),duration:elapsed()};
  state.roasts.unshift(roast);if(!persist())return;
  state.points=[];state.events=[];persist();$("roastWeight").value="";$("roastLevel").value="";$("roastMemo").value="";resetTimer();renderEvents();drawChart();renderHistory();toast("焙煎記録を保存しました");
}
function renderHistory() {
  const filter=$("historyBeanFilter").value;
  const list=state.roasts.filter(r=>!filter||r.beanId===filter);
  $("historyList").innerHTML=list.length?list.map(r=>`<article class="list-card"><div class="list-card-top"><div><h3>${esc(r.beanName||"名称未設定")}</h3><p>${new Date(r.date).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</p><p>${r.weight?esc(r.weight)+"g / ":""}${esc(r.level||"焙煎度未設定")} / ${fmtTime(r.duration||0)} / ${(r.points||[]).length}点</p></div><span class="muted small">${esc((r.events||[]).map(e=>e.type).join("・"))}</span></div><div class="card-actions"><button class="mini-button" data-view-roast="${esc(r.id)}">詳細</button><button class="mini-button" data-master-roast="${esc(r.id)}">マスターに登録</button><button class="mini-button danger" data-delete-roast="${esc(r.id)}">削除</button></div></article>`).join(""):'<div class="empty-state">焙煎記録はまだありません。焙煎画面から記録を保存してください。</div>';
}
function showRoastDetail(id) {
  const r=state.roasts.find(x=>x.id===id);if(!r)return;
  $("detailTitle").textContent=r.beanName||"焙煎記録";
  const date=new Date(r.date).toLocaleString("ja-JP");
  $("recordDetail").innerHTML=`<p class="muted small">${esc(date)}</p><div class="detail-grid"><div class="detail-cell"><small>投入量</small><strong>${r.weight?esc(r.weight)+" g":"未記録"}</strong></div><div class="detail-cell"><small>焙煎度</small><strong>${esc(r.level||"未選択")}</strong></div><div class="detail-cell"><small>焙煎時間</small><strong>${fmtTime(r.duration||0)}</strong></div><div class="detail-cell"><small>温度記録</small><strong>${(r.points||[]).length}点</strong></div></div><h3>イベント</h3><p>${(r.events||[]).map(e=>esc(e.type)+" "+fmtTime(e.t)+(Number.isFinite(Number(e.temp))?" / "+esc(e.temp)+"℃":"")).join(" / ")||"なし"}</p><h3>温度記録</h3><p>${(r.points||[]).map(p=>fmtTime(p.t)+"："+esc(p.temp)+"°C").join("、")||"なし"}</p><h3>メモ</h3><p>${esc(r.memo||"メモなし")}</p>`;
  $("recordDialog").showModal();
}
function registerRoastAsMaster(id) {
  const r=state.roasts.find(x=>x.id===id);if(!r)return;
  const bean=state.beans.find(b=>b.id===r.beanId);if(!bean){toast("該当する豆マスターがありません");return;}
  if(!confirm(`${bean.name}のマスターカーブを、この焙煎記録で上書きしますか？`))return;
  bean.masterCurve=(r.points||[]).map(p=>({...p}));bean.updatedAt=nowISO();persist();renderBeans();toast("マスターカーブを更新しました");
}
function exportData() {
  const payload={app:"CHORUJARO ROAST MANAGER",schemaVersion:1,exportedAt:nowISO(),beans:state.beans,roasts:state.roasts};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`chorujaro-roast-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);$("backupStatus").textContent="バックアップを書き出しました。安全な場所に保管してください。";
}
function importData(file) {
  if(!file)return;const reader=new FileReader();
  reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data||!Array.isArray(data.beans)||!Array.isArray(data.roasts))throw new Error("形式が違います");
    if(!confirm(`豆マスター${data.beans.length}件、焙煎記録${data.roasts.length}件を復元します。現在のデータは置き換わります。先に現在のバックアップを取っていますか？`))return;
    state.beans=data.beans;state.roasts=data.roasts;if(!persist())return;renderBeans();renderHistory();$("backupStatus").textContent="データを復元しました。";toast("バックアップを復元しました");
  }catch(e){console.error(e);$("backupStatus").textContent="復元できませんでした。正しいJSONバックアップを選択してください。";toast("JSONの形式を確認してください");}};
  reader.readAsText(file);
}
function switchPage(page) {
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  if(page==="roast")drawChart();if(page==="beans")renderBeans();if(page==="history")renderHistory();
  window.scrollTo({top:0,behavior:"instant"});
}
function bindEvents() {
  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>switchPage(b.dataset.page)));
  $("startPauseBtn").addEventListener("click",startTimer);$("resetTimerBtn").addEventListener("click",()=>{if(confirm("タイマーをリセットしますか？"))resetTimer();});
  $("recordTempBtn").addEventListener("click",recordPoint);
  $("temperatureKeypad").addEventListener("click",e=>{const button=e.target.closest("button");if(!button)return;if(button.dataset.digit!==undefined)pressTemperatureKey(button.dataset.digit);else if(button.dataset.key)pressTemperatureKey(button.dataset.key);});
  $("firstCrackBtn").addEventListener("click",()=>addEvent("1ハゼ"));$("secondCrackBtn").addEventListener("click",()=>addEvent("2ハゼ"));$("dropBtn").addEventListener("click",()=>addEvent("煎り止め"));
  $("saveRoastBtn").addEventListener("click",saveRoast);$("roastBeanSelect").addEventListener("change",drawChart);
  $("clearPointsBtn").addEventListener("click",()=>{if(confirm("今回入力した温度点とイベントを消去しますか？")){state.points=[];state.events=[];persist();renderEvents();drawChart();}});
  $("beanForm").addEventListener("submit",saveBean);$("addMasterPointBtn").addEventListener("click",()=>addMasterRow());$("cancelBeanEditBtn").addEventListener("click",resetBeanForm);
  $("beanList").addEventListener("click",e=>{const edit=e.target.closest("[data-edit-bean]"),del=e.target.closest("[data-delete-bean]");if(edit)editBean(edit.dataset.editBean);if(del){const id=del.dataset.deleteBean;if(confirm("この豆マスターを削除しますか？過去の焙煎記録は残ります。")){state.beans=state.beans.filter(b=>b.id!==id);persist();renderBeans();toast("豆マスターを削除しました");}}});
  $("historyBeanFilter").addEventListener("change",renderHistory);
  $("historyList").addEventListener("click",e=>{const view=e.target.closest("[data-view-roast]"),master=e.target.closest("[data-master-roast]"),del=e.target.closest("[data-delete-roast]");if(view)showRoastDetail(view.dataset.viewRoast);if(master)registerRoastAsMaster(master.dataset.masterRoast);if(del){const id=del.dataset.deleteRoast;if(confirm("この焙煎記録を削除しますか？")){state.roasts=state.roasts.filter(r=>r.id!==id);persist();renderHistory();toast("記録を削除しました");}}});
  $("exportBtn").addEventListener("click",exportData);$("importFile").addEventListener("change",e=>{importData(e.target.files[0]);e.target.value="";});
  window.addEventListener("resize",()=>{if($("page-roast").classList.contains("active"))drawChart();});
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.deferredInstall=e;$("installBtn").hidden=false;});
  $("installBtn").addEventListener("click",async()=>{if(!state.deferredInstall)return;state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;$("installBtn").hidden=true;});
}
function init() {
  loadData();bindEvents();resetBeanForm();renderBeans();renderHistory();renderTimer();renderEvents();
  if(state.timerRunning){state.timerInterval=setInterval(renderTimer,250);}
  if("serviceWorker" in navigator && location.protocol!=="file:")navigator.serviceWorker.register("./service-worker.js").catch(e=>console.warn("SW登録失敗",e));
  $("connectionStatus").textContent=navigator.onLine?"● オフライン対応":"● オフライン";
  window.addEventListener("online",()=>$("connectionStatus").textContent="● オフライン対応");
  window.addEventListener("offline",()=>$("connectionStatus").textContent="● オフライン");
}
document.addEventListener("DOMContentLoaded",init);
})();