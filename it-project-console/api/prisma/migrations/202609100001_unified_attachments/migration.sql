ALTER TYPE "attachment_kind" ADD VALUE IF NOT EXISTS 'FILE';
ALTER TABLE demands ADD COLUMN IF NOT EXISTS attachment_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE demands d SET attachment_ids = ARRAY(
  SELECT item.id FROM unnest(ARRAY[d.prd_attachment_id, d.prototype_attachment_id]) WITH ORDINALITY AS item(id, position)
  JOIN attachments a ON a.id = item.id AND a.demand_id = d.id AND a.status = 'READY'
  WHERE item.id IS NOT NULL GROUP BY item.id ORDER BY min(item.position)
) WHERE cardinality(d.attachment_ids) = 0;
