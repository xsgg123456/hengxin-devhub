from pathlib import Path
import re, base64

root = Path(__file__).resolve().parent
repo = root.parent.parent
source = Path('C:/Users/82358/Downloads/AI IT项目管理台.html').read_text(encoding='utf-8')
css = (root / 'art-theme.css').read_text(encoding='utf-8')
adapter = (root / 'role-adapter.js').read_text(encoding='utf-8')
logo = repo / 'it-project-console/web/src/assets/images/common/logo.webp'
logo_uri = 'data:image/webp;base64,' + base64.b64encode(logo.read_bytes()).decode()

# Retain the reference HTML's complete chart renderers, forms, tables and data.
# Only strip the platform-specific header: standalone prototypes never use its SDK.
source = re.sub(r'<header class="topbar">.*?</header>', '<header class="topbar"><div class="wrap"><div class="art-header-crumb"><span>☰</span><span>IT 项目管理台</span><span>/</span><span id="art-crumb"></span></div><div class="art-user"><span class="tag s-doing">原型评审</span><span class="art-avatar">__AVATAR__</span><div><div class="art-user-name">__USER__</div><div class="art-user-role">__ROLE_LABEL__</div></div></div></div></header>', source, flags=re.S)
source = source.replace('<aside class="sidebar">', '<aside class="sidebar"><div class="art-logo"><img src="'+logo_uri+'" alt="Art Design Pro">IT 项目管理台</div>')
source = source.replace('<div id="backupTip"></div>', '<div id="art-page-heading" class="art-page-heading"></div><div id="backupTip"></div>')
source = source.replace('数据存于资料库<br>断网自动转离线模式', '基于 Art Design Pro 母版<br>图表与交互来自参考 HTML')
source = source.replace('var canManage = true;', "var canManage = ART_ROLE === 'manager';")
# The reference uses 58px bars; preserve values and tooltips with a legible chart height.
source = source.replace('var BAR = 58;', 'var BAR = 124;')
source = source.replace('#2563eb', '#5d87ff').replace('#16a34a', '#13b99a').replace('#dc2626', '#ff4d4f').replace('#ea580c', '#f59b18')
source = source.replace('(x + w + 5)', '(Math.min(x + w + 5, trackW - 76))')
source = source.replace("if(document.readyState === 'loading'){", adapter + "\nif(document.readyState === 'loading'){")
source = source.replace('</head>', '<style>'+css+'</style></head>')
for role, user, label in [('manager','陈立峰','管理人员 · 项目经理'),('engineer','冯涛','IT工程师'),('business','杜鹃','业务人员')]:
    navigation='<div class="role-preview"><span>三角色完整原型</span>'+''.join('<a class="'+('selected' if key==role else '')+'" href="'+key+'.html">'+text+'</a>' for key,text in [('manager','管理人员'),('engineer','IT工程师'),('business','业务人员')])+'<small>独立 HTML · 共用本地演示数据 · 未连接线上系统</small></div>'
    output=source.replace('<body>', '<body data-role="'+role+'">'+navigation).replace('__USER__',user).replace('__AVATAR__',user[-2:]).replace('__ROLE_LABEL__',label)
    output=output.replace('<title>AI IT 项目管理台</title>', '<title>'+label+' · 完整原型 V2</title>')
    (root / (role+'.html')).write_text(output,encoding='utf-8')
print('Built 3 self-contained HTML prototypes from the complete reference source.')
