export function notificationProjectLabels(parentProjectId: string | null, stage: string, risks: string[]) {
  const optimization = !!parentProjectId
  return {
    type: optimization ? '项目优化' : '正式项目',
    stage: optimization ? '优化完成验收' : stage,
    risks: risks.map(risk => optimization ? risk.replaceAll('验收交付', '优化完成验收').replaceAll('项目延期', '优化延期') : risk)
  }
}
