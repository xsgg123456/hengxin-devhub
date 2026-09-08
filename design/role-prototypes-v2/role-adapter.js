/* The reference implementation remains the chart/data-rendering baseline. */
var ART_ROLE = document.body.dataset.role;
var ART_USER = ART_ROLE === 'engineer' ? '冯涛' : ART_ROLE === 'business' ? '杜鹃' : '陈立峰';
var ART_SCOPE = ART_ROLE === 'manager' ? 'all' : 'mine';
var ART_ROLE_LABEL = {manager:'管理人员 · 项目经理',engineer:'IT工程师',business:'业务人员'}[ART_ROLE];
var ART_RAW = {};
['filterProjects','computeToday','renderNav','renderToday','renderDemands','renderStats','computePeople','ganttRows','rankTipHtml','openProjectDetail','openProjectModal','saveProject','delProject','openProgressModal','saveProgress','openDemandAssign','saveDemandAssign','openDemandModal','buildDemandBody','renderLoadChart'].forEach(function(k){ ART_RAW[k] = window[k]; });
Object.keys(LK).forEach(function(k){ LK[k] = 'art-role-reference-v2.' + k; });
sdk = function(){ return null; }; // This standalone prototype never connects to WorkBuddy.
function artMine(p){ return p.owner === ART_USER || (p.members || []).indexOf(ART_USER) >= 0 || (p.subOwners || []).indexOf(ART_USER) >= 0; }
function artLead(p){ return ART_ROLE === 'manager' || (ART_ROLE === 'engineer' && p && p.owner === ART_USER); }
function artEdit(p){ return !!p && (ART_ROLE === 'manager' || ART_ROLE === 'engineer' && artMine(p)); }
function artProjects(){ return ART_SCOPE === 'all' || ART_ROLE === 'manager' ? state.projects : state.projects.filter(ART_ROLE === 'engineer' ? artMine : function(p){ return p.requester === ART_USER; }); }
function artDemands(){ return ART_SCOPE === 'all' || ART_ROLE === 'manager' ? state.demands : state.demands.filter(function(d){ return ART_ROLE === 'engineer' ? splitNames(d.owner || '').indexOf(ART_USER) >= 0 || d.person === ART_USER : d.person === ART_USER; }); }
function artWithin(projects,demands,fn){ var p=state.projects,d=state.demands; try { state.projects=projects;state.demands=demands;return fn(); } finally {state.projects=p;state.demands=d;} }
filterProjects = function(){ var selected=artProjects();return artWithin(selected,state.demands,function(){return ART_RAW.filterProjects();}); };
ganttRows = function(ym){return artWithin(artProjects(),state.demands,function(){return ART_RAW.ganttRows(ym);});};
computePeople = function(ym){return artWithin(artProjects(),state.demands,function(){return ART_RAW.computePeople(ym);});};
rankTipHtml = function(name,ym,withScore){return artWithin(artProjects(),state.demands,function(){return ART_RAW.rankTipHtml(name,ym,withScore);});};
openProjectDetail = function(id){ART_RAW.openProjectDetail(id);artControls();};
computeToday = function(){
  if(ART_ROLE === 'business') return state.demands.filter(function(d){return d.person===ART_USER&&d.status==='待补充';}).map(function(d){return {level:'warn',title:d.title,meta:d.returnReason||'请补充需求材料后重新提交',pid:'',act:'补充材料',fn:"artEditDemand('"+d.rid+"')"};});
  var items=ART_RAW.computeToday();
  if(ART_ROLE==='engineer') items=items.filter(function(i){var p=findProject(i.pid);return p&&artMine(p);});
  return items.map(function(i){var copy=Object.assign({},i);if(ART_ROLE==='manager'&&i.pid){copy.act='查看 / 协调';copy.fn="openProjectDetail('"+i.pid+"')";}return copy;});
};
function artScope(scope){ ART_SCOPE=scope;state.fOwner='';state.fStatus='';state.fDept='';state.fGap='';state.opDateA='';state.opDateB='';state.fDateA='';state.fDateB='';refreshAll(); }
function artIcon(key){return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(PAGE_ICON[key]||PAGE_ICON.overview)+'</svg>';}
renderNav = function(){
  ART_RAW.renderNav();
  var menu=ART_ROLE==='manager'?[['overview','项目总览'],['today','今日待办'],['gantt','甘特图'],['demand','需求池']]:ART_ROLE==='engineer'?[['overview','我的项目 / 全部项目'],['today','我的待办'],['gantt','甘特图'],['demand','需求池']]:[['demand','我的需求 / 需求池'],['overview','项目进展'],['gantt','甘特图'],['today','待我补充']];
  document.getElementById('navBar').innerHTML=menu.map(function(x){return '<button class="navbtn'+(state.tab===x[0]?' on':'')+'" onclick="switchPage(\''+x[0]+'\')">'+artIcon(x[0])+'<span class="lb">'+x[1]+'</span>'+(x[0]==='today'&&computeToday().length?'<span class="navbadge">'+computeToday().length+'</span>':'')+'</button>';}).join('');
  var title=menu.filter(function(x){return x[0]===state.tab;})[0][1];
  var descriptions={overview:'筛选 → 关键指标与分布 → 人员负载 → 完整项目明细',today:ART_ROLE==='manager'?'团队风险、待评估需求与需要协调的事项':ART_ROLE==='engineer'?'只展示与你负责或参与的项目有关的待办':'需要你补充的需求材料；等待评估不计为个人待办',gantt:'每日刻度、计划与实际进度双条、今日线、跨月项目与悬停明细',demand:'需求明细、提出人分布、部门分布与按月趋势，随筛选联动'};
  document.getElementById('art-page-heading').innerHTML='<div><h1>'+title+'</h1><p>'+descriptions[state.tab]+'</p></div><div class="art-heading-actions">'+(ART_ROLE==='manager'?'<span class="tag s-doing">管理视角 · 全量数据</span>':'<div class="art-scope"><button class="'+(ART_SCOPE==='mine'?'selected':'')+'" onclick="artScope(\'mine\')">'+(ART_ROLE==='business'?'与我相关':'我负责 / 参与')+'</button><button class="'+(ART_SCOPE==='all'?'selected':'')+'" onclick="artScope(\'all\')">全部数据</button></div>')+'</div>';
  document.getElementById('art-crumb').textContent=title;
};
renderStats=function(){ART_RAW.renderStats();var chart=document.querySelector('.ovchart');if(chart)chart.insertAdjacentHTML('afterbegin','<div class="art-chart-title">项目状态分布<span>鼠标悬停查看对应项目</span></div>');};
renderToday=function(){ART_RAW.renderToday();if(ART_ROLE!=='manager'){var create=document.querySelector('#todaySec button[onclick^="openProjectModal"]');if(create)create.remove();}if(ART_ROLE==='business'){var heading=document.querySelector('#todaySec h2');if(heading)heading.textContent='待我补充';}};
renderDemands=function(){var selected=artDemands();artWithin(state.projects,selected,function(){ART_RAW.renderDemands();});
  if(ART_ROLE==='business'&&ART_SCOPE==='mine'){var p=state.projects.filter(function(x){return x.requester===ART_USER;}),parts=[['我提交的需求',selected.length],['待评估',selected.filter(function(x){return x.status==='待评估';}).length],['推进中',p.filter(function(x){return !isDone(x);}).length],['已交付',p.filter(function(x){return x.status==='已完成';}).length]];document.getElementById('pane-demand').insertAdjacentHTML('afterbegin','<div class="art-demand-summary">'+parts.map(function(x){return stat(x[0],x[1],'','');}).join('')+'</div>');}
  var charts=document.querySelectorAll('#pane-demand .dstat');charts.forEach(function(el,i){el.insertAdjacentHTML('afterbegin','<div class="art-chart-title">'+(i===0?'需求提出人分布':i===1?'需求部门分布':'按月需求趋势')+'<span>'+(i<2?'占比 + 数量 + 对应需求明细':'每月需求数量 · 按部门堆叠')+'</span></div>');});
  if(charts.length>=2){var grid=document.createElement('div');grid.className='art-chart-grid';charts[0].parentNode.insertBefore(grid,charts[0]);grid.append(charts[0],charts[1]);}
  if(ART_ROLE!=='manager'){
    var table=document.querySelector('#pane-demand .tbl-fluid');
    if(table){table.querySelector('thead tr').insertAdjacentHTML('beforeend','<th>操作</th>');table.querySelectorAll('tbody tr').forEach(function(row){var title=row.querySelector('td>div').textContent;var d=state.demands.filter(function(x){return x.title===title;})[0];if(d)row.insertAdjacentHTML('beforeend','<td><button class="btn sm ghost" onclick="artDemandDetail(\''+d.rid+'\')">查看</button></td>');});}
  }
  artControls();
};
renderLoadChart=function(){ART_RAW.renderLoadChart();var h=document.querySelector('#loadBox .hd h2');if(h&&ART_SCOPE==='mine'&&ART_ROLE!=='manager')h.textContent=state.rankMonth+' 相关项目人员负载';};
function artControls(){
  document.querySelectorAll('button[onclick]').forEach(function(b){var call=b.getAttribute('onclick');if(ART_ROLE!=='manager'&&/^(openProjectModal|delProject|openDemandAssign|saveDemandAssign|clearDemo|importJSON)/.test(call)){b.style.display='none';}if(call.indexOf('openProgressModal(')===0){var id=call.match(/'([^']+)'/);var p=id&&findProject(id[1]);if(!artEdit(p))b.style.display='none';else if(!artLead(p))b.textContent='填写协作进展';}});
  document.querySelectorAll('.pcard').forEach(function(card){var edit=card.querySelector('[onclick^="openProgressModal"]');var id=edit&&edit.getAttribute('onclick').match(/'([^']+)'/);var p=id&&findProject(id[1]);if(p&&!card.querySelector('.art-readonly'))card.insertAdjacentHTML('beforeend','<div class="art-readonly">'+(ART_ROLE==='manager'?'管理人员可维护项目':artLead(p)?'你是主负责人 · 可更新整体进度':artEdit(p)?'你参与协作 · 仅填写个人进展':'全员可读 · 当前无修改权限')+'</div>');});
}
['openProjectModal','saveProject','delProject','openDemandAssign','saveDemandAssign'].forEach(function(k){window[k]=function(){if(ART_ROLE!=='manager'){alert('此操作仅向管理人员开放');return;}return ART_RAW[k].apply(null,arguments);};});
openProgressModal=function(id){var p=findProject(id);if(!artEdit(p)){alert('你不是此项目成员，只能查看');return;}if(!artLead(p)){showModal('填写协作进展 · '+p.name,'<div class="hintbox">你是协作人。填写个人进展，不修改项目整体阶段、日期与状态。</div><div class="frow"><label>填报人</label><input value="'+esc(ART_USER)+'" disabled></div><div class="frow"><label>个人进展 *</label><textarea id="art-collab-work" placeholder="本次完成的工作与下一步安排"></textarea></div><div class="frow"><label>阻塞问题 / 需协助</label><textarea id="art-collab-block"></textarea></div><div class="mact"><button class="btn ghost" onclick="closeModal()">取消</button><button class="btn" onclick="artSaveCollab(\''+id+'\')">保存进展</button></div>');return;}ART_RAW.openProgressModal(id);var filler=document.getElementById('g_filler');if(filler){filler.value=ART_USER;filler.disabled=true;}};
saveProgress=function(id){var p=findProject(id);if(!artLead(p))return;var f=document.getElementById('g_filler');if(f)f.value=ART_USER;ART_RAW.saveProgress(id);};
function artSaveCollab(id){var p=findProject(id);if(!artEdit(p))return;var text=document.getElementById('art-collab-work').value.trim();if(!text){alert('请填写个人进展');return;}addLog({date:TODAY,pid:id,pname:p.name,filler:ART_USER,phase:p.phase,st:'进行中',prog:overallProgress(p),work:text,blocker:document.getElementById('art-collab-block').value.trim(),needHelp:!!document.getElementById('art-collab-block').value.trim(),demo:false});closeModal();refreshAll();}
openDemandModal=function(){ART_RAW.openDemandModal();state.draft.person=ART_USER;var r=requesterOf(ART_USER);state.draft.dept=r?r.m:'信息技术部';refreshDemandModal();};
buildDemandBody=function(){var h=ART_RAW.buildDemandBody();return h.replace('id="d_person"','id="d_person" disabled');};
function artEditDemand(id){var d=state.demands.filter(function(x){return x.rid===id;})[0];if(!d||d.person!==ART_USER)return;showModal('补充需求 · '+d.title,'<div class="hintbox">'+esc(d.returnReason||'补充业务目标与材料')+'</div><div class="frow"><label>补充说明 *</label><textarea id="art-extra">'+esc(d.desc)+'</textarea></div><div class="mact"><button class="btn ghost" onclick="closeModal()">取消</button><button class="btn" onclick="artResubmit(\''+id+'\')">重新提交</button></div>');}
function artResubmit(id){var d=state.demands.filter(function(x){return x.rid===id;})[0];if(!d||d.person!==ART_USER)return;var v=document.getElementById('art-extra').value.trim();if(!v){alert('请补充说明');return;}d.desc=v;d.status='待评估';upsertDemand(d,false);closeModal();refreshAll();}
function artDemandDetail(id){var d=state.demands.filter(function(x){return x.rid===id;})[0];if(!d)return;var p=linkedProjectOf(d);showModal('需求详情 · '+d.title,'<div class="hintbox">'+esc(d.status)+' · '+esc(d.person)+' · '+esc(d.dept)+'</div><div class="f2"><div class="frow"><label>提交时间</label>'+esc(d.ctime||'—')+'</div><div class="frow"><label>期望完成</label>'+esc(d.expect||'—')+'</div></div><div class="frow"><label>需求说明</label><p>'+esc(d.desc||'暂无说明')+'</p></div><div class="frow"><label>需求材料</label>'+attCellFor(d)+'</div>'+(p?'<div class="hintbox">关联项目：'+esc(p.name)+'<br>'+esc(p.phase)+' · '+esc(p.status)+' · 计划完成 '+esc(p.planEnd)+'</div>':'')+'<div class="mact"><button class="btn ghost" onclick="closeModal()">关闭</button>'+(p?'<button class="btn" onclick="openProjectDetail(\''+p.rid+'\')">查看项目进展</button>':'')+(d.person===ART_USER&&(d.status==='待评估'||d.status==='待补充')?'<button class="btn" onclick="artEditDemand(\''+id+'\')">补充说明</button>':'')+'</div>');}
renderBackupTip=function(){document.getElementById('backupTip').innerHTML='';};
renderStatLine=function(){};
var artRefresh=refreshAll;
refreshAll=function(){artRefresh();artControls();};
var artInit=init;
init=function(){state.tab=ART_ROLE==='business'?'demand':'overview';artInit();document.getElementById('sideSync').textContent='独立原型 · 本地演示';};
