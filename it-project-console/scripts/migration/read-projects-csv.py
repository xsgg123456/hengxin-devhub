"""Read a user-supplied CSV without modifying it; output a UTF-8 JSON migration input."""
import csv
import hashlib
import io
import json
import sys
from collections import Counter
from pathlib import Path

source, target = map(Path, sys.argv[1:3])
raw = source.read_bytes()
try:
    content = raw.decode('utf-8-sig')
    encoding = 'utf-8-sig'
except UnicodeDecodeError:
    content = raw.decode('gb18030')
    encoding = 'gb18030'
reader = csv.DictReader(io.StringIO(content))
required = ['项目名称', '状态', '业务负责人', 'AI工程师', '紧急程度', '部门', '开始时间', '计划完成', '实际完成时间']
if not reader.fieldnames or not set(required).issubset(reader.fieldnames):
    raise ValueError('CSV缺少必需表头')
rows = []
for index, row in enumerate(reader, 2):
    if None in row or any(value is None for value in row.values()):
        raise ValueError(f'第{index}条记录列数不符')
    if not any(row.values()):
        continue
    if not row['项目名称'].strip():
        raise ValueError(f'第{index}条记录缺项目名')
    rows.append({'row': index, 'fields': {key: value.strip() for key, value in row.items()}, 'rawFields': dict(row)})
result = {'format': 'projects-csv-v1', 'sourceName': source.name, 'sha256': hashlib.sha256(raw).hexdigest(), 'encoding': encoding, 'rows': rows}
target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'rows': len(rows), 'encoding': encoding, 'states': dict(Counter(r['fields']['状态'] for r in rows)), 'duplicateNames': {name: count for name, count in Counter(r['fields']['项目名称'] for r in rows).items() if count > 1}, 'sha256': result['sha256']}, ensure_ascii=False))
